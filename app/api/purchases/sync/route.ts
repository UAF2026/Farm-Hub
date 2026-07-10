import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { PurchaseOrder, PurchaseProduct } from '@/lib/types';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Sync Crop Advisors purchase orders from Gmail.
//
// Uses Gmail API with OAuth2 (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET /
// GMAIL_REFRESH_TOKEN set in Vercel env vars) to:
//   1. Search for emails from orders@cropadvisors.com with PDF attachments
//   2. Download each PDF attachment (base64)
//   3. Parse the PDF text to extract order ref, supplier, products, prices
//   4. Store structured orders in farmdata.purchases

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const API_SECRET = process.env.API_SECRET;
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const ROW_ID = 'farmhub_main';

function checkAuth(req: NextRequest): NextResponse | null {
  if (!API_SECRET) return null;
  const url = new URL(req.url);
  const provided = req.headers.get('x-api-secret') || url.searchParams.get('secret');
  if (provided !== API_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  return null;
}

// ── Gmail OAuth token refresh ─────────────────────────────────────────────────
async function getGmailAccessToken(): Promise<string> {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in Vercel env vars.');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ── Gmail API helpers ─────────────────────────────────────────────────────────
async function gmailGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload?: {
    headers?: { name: string; value: string }[];
    parts?: GmailPart[];
    body?: { data?: string; attachmentId?: string };
    mimeType?: string;
  };
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailAttachment {
  data?: string;
  size?: number;
}

// Recursively find PDF parts in a message payload
function findPdfParts(parts: GmailPart[] | undefined): GmailPart[] {
  if (!parts) return [];
  const result: GmailPart[] = [];
  for (const part of parts) {
    if (part.mimeType === 'application/pdf' && part.filename) {
      result.push(part);
    }
    if (part.parts) {
      result.push(...findPdfParts(part.parts));
    }
  }
  return result;
}

// ── PDF text extraction (pure JS — no binary deps needed) ────────────────────
// We use a simple regex-based approach on the raw PDF bytes converted to string.
// Crop Advisors PDFs are simple single-page text PDFs — no OCR needed.
function extractTextFromPdfBytes(bytes: Uint8Array): string {
  // Convert to latin1 string to read PDF text streams
  const raw = Buffer.from(bytes).toString('latin1');

  // Extract text from PDF stream objects (BT...ET blocks)
  const textBlocks: string[] = [];
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract strings from Tj and TJ operators
    const strRegex = /\(([^)]*)\)\s*Tj|\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/g;
    let strMatch;
    while ((strMatch = strRegex.exec(block)) !== null) {
      if (strMatch[1] !== undefined) {
        textBlocks.push(strMatch[1]);
      } else if (strMatch[2] !== undefined) {
        // TJ array — extract string parts
        const tjContent = strMatch[2];
        const tjStrings = tjContent.match(/\(([^)]*)\)/g) || [];
        textBlocks.push(tjStrings.map(s => s.slice(1, -1)).join(''));
      }
    }
  }

  return textBlocks.join(' ').replace(/\\n/g, '\n').replace(/\\/g, '');
}

// ── Order parsing ─────────────────────────────────────────────────────────────
function parsePdfText(text: string, filename: string): PurchaseOrder | null {
  // Normalise whitespace
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const fullText = lines.join('\n');

  // Order reference
  const refMatch = fullText.match(/Order Number:\s*([\w]+)/);
  if (!refMatch) return null;
  const ref = refMatch[1];
  const type: PurchaseOrder['type'] = ref.startsWith('F') ? 'Fertiliser'
    : ref.startsWith('C') ? 'Chemical'
    : ref.startsWith('S') ? 'Seed'
    : 'Other';

  // Date and payment
  const dateMatch = fullText.match(/Date of Order:\s*(.+?)(?:\n|$)/);
  const paymentMatch = fullText.match(/Payment Due:\s*(\S+)/);

  // Supplier — line containing "Account Reference:"
  let supplier = '';
  for (const line of lines) {
    if (line.includes('Account Reference:')) {
      supplier = line.split('Account Reference:')[0].trim();
      break;
    }
  }

  // Products — lines after header row
  const products: PurchaseProduct[] = [];
  let inProducts = false;
  for (const line of lines) {
    if (/^Brand\s+Quantity\s+Bag\s*Size\s+Price\s+Unit/.test(line)) {
      inProducts = true;
      continue;
    }
    if (inProducts) {
      if (/^\d{2}\s+\w{3}\s+\d{4}/.test(line)) break; // footer date
      // Match product line: Name ... qty Tonnes/Litres/Kg ... bagsize ... £price ... Per unit
      const m = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(Tonnes|Litres|Kg)\s+(.+?)\s+£([\d,]+\.?\d*)\s+Per\s+(\w+)/i);
      if (m) {
        const qty = parseFloat(m[2]);
        const price = parseFloat(m[5].replace(/,/g, ''));
        products.push({
          name: m[1].trim(),
          quantity: qty,
          unit: m[3],
          bagSize: m[4].trim(),
          pricePerUnit: price,
          priceUnit: `Per ${m[6]}`,
          totalValue: Math.round(qty * price * 100) / 100,
        });
      }
    }
  }

  const cancelled = filename.toLowerCase().includes('cancel') || ref.includes('cancel');

  return {
    id: uuidv4(),
    ref,
    type,
    date: dateMatch?.[1]?.trim() || '',
    paymentDue: paymentMatch?.[1] || '',
    supplier,
    products,
    totalValue: Math.round(products.reduce((s, p) => s + p.totalValue, 0) * 100) / 100,
    cancelled,
    source: filename,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const denied = checkAuth(req);
  if (denied) return denied;

  try {
    const token = await getGmailAccessToken();

    // Search Gmail for Crop Advisors order emails
    const query = 'from:orders@cropadvisors.com has:attachment';
    let allMessageIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const url = `/messages?q=${encodeURIComponent(query)}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const listResp = await gmailGet<GmailListResponse>(url, token);
      if (listResp.messages) {
        allMessageIds.push(...listResp.messages.map(m => m.id));
      }
      pageToken = listResp.nextPageToken;
    } while (pageToken);

    // Fetch each message and its PDF attachments
    const orders: PurchaseOrder[] = [];
    const errors: string[] = [];

    for (const msgId of allMessageIds) {
      try {
        const msg = await gmailGet<GmailMessage>(`/messages/${msgId}?format=full`, token);
        const subject = msg.payload?.headers?.find(h => h.name === 'Subject')?.value || '';

        // Skip if subject is clearly cancelled
        const isCancelled = subject.toLowerCase().includes('cancel');

        const pdfParts = findPdfParts(msg.payload?.parts);

        for (const part of pdfParts) {
          const filename = part.filename || 'unknown.pdf';
          const attachmentId = part.body?.attachmentId;
          if (!attachmentId) continue;

          try {
            const attResp = await gmailGet<GmailAttachment>(
              `/messages/${msgId}/attachments/${attachmentId}`,
              token
            );
            if (!attResp.data) continue;

            // Gmail uses URL-safe base64 — decode it
            const base64 = attResp.data.replace(/-/g, '+').replace(/_/g, '/');
            const bytes = Buffer.from(base64, 'base64');

            // Extract text from PDF
            const text = extractTextFromPdfBytes(new Uint8Array(bytes));

            const order = parsePdfText(text, isCancelled ? `${filename} (Cancelled)` : filename);
            if (order) {
              if (isCancelled) order.cancelled = true;
              orders.push(order);
            }
          } catch (e) {
            errors.push(`${filename}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } catch (e) {
        errors.push(`msg ${msgId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Sort by date descending
    orders.sort((a, b) => b.ref.localeCompare(a.ref));

    // Save to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: existing } = await supabase
      .from('farmdata').select('data').eq('id', ROW_ID).single();
    const current = (existing as { data?: Record<string, unknown> } | null)?.data ?? {};
    const merged = {
      ...current,
      purchases: orders,
      purchasesSyncStatus: {
        syncedAt: new Date().toISOString(),
        ordersFound: orders.length,
      },
    };
    const { error: saveErr } = await supabase
      .from('farmdata')
      .upsert({ id: ROW_ID, data: merged, updated_at: new Date().toISOString() });
    if (saveErr) throw new Error(`Supabase save failed: ${saveErr.message}`);

    return NextResponse.json({
      ok: true,
      ordersFound: orders.length,
      messagesFound: allMessageIds.length,
      totalSpend: orders.filter(o => !o.cancelled).reduce((s, o) => s + o.totalValue, 0),
      byType: {
        fertiliser: orders.filter(o => o.type === 'Fertiliser' && !o.cancelled).length,
        chemical: orders.filter(o => o.type === 'Chemical' && !o.cancelled).length,
        seed: orders.filter(o => o.type === 'Seed' && !o.cancelled).length,
      },
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
