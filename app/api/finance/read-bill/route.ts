import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { gmailToken, gmail, pdfParts, pdfBase64, header, gmailDate, type GmailPart, type GmailMessage, anthropicKey } from '@/lib/gmail';

// POST { supplier, ref, date, desc } → finds the bill's email in Gmail, reads
// its PDF with Claude and returns the amounts. Saves nothing: the Finance page
// writes the result into its own copy of the data, so nothing gets overwritten
// by a browser tab holding an older copy.
//
// Needs GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN (same as
// Purchases) and ANTHROPIC_API_KEY in the Vercel env vars.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ymd = gmailDate;
const shift = (iso: string, days: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return d; };

/** Gmail searches to try, most specific first. */
function searches(supplier: string, ref: string, date: string): string[] {
  const when = date ? ` after:${ymd(shift(date, -10))} before:${ymd(shift(date, 6))}` : '';
  const out: string[] = [];
  // The invoice number usually appears in the subject, body or file name.
  const refTok = (ref.match(/[A-Z]{0,4}[-/]?\d[\w/-]{3,}/i)?.[0] ?? '').replace(/^(invoice|inv)\s*/i, '');
  if (refTok) out.push(`has:attachment "${refTok}"${when}`);
  const word = supplier.replace(/\(.*?\)/g, '').replace(/\b(ltd|limited|plc|llp|&|and|sons?|the|uk|co|group|agri(cultural)?|farm|services|energy|business)\b/gi, ' ').trim().split(/\s+/).filter(w => w.length > 2)[0];
  if (word) out.push(`has:attachment filename:pdf "${word}"${when}`);
  return out;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['docType', 'supplier', 'invoiceNo', 'invoiceDate', 'dueDate', 'net', 'vat', 'gross', 'description'],
  properties: {
    docType: { type: 'string', enum: ['invoice', 'credit_note', 'statement', 'remittance', 'order_confirmation', 'reminder', 'other'] },
    supplier: { type: 'string' },
    invoiceNo: { type: 'string' },
    invoiceDate: { type: 'string', description: 'YYYY-MM-DD, or empty' },
    dueDate: { type: 'string', description: 'YYYY-MM-DD, or empty if not stated' },
    net: { type: ['number', 'null'] },
    vat: { type: ['number', 'null'] },
    gross: { type: ['number', 'null'], description: 'Total payable including VAT. For a statement, the balance owed.' },
    description: { type: 'string', description: 'What was bought, in under 12 words' },
  },
} as const;

export interface ReadBillResult {
  found: boolean;
  docType?: string; supplier?: string; invoiceNo?: string; invoiceDate?: string; dueDate?: string;
  net?: number | null; vat?: number | null; gross?: number | null; description?: string;
  fileName?: string; subject?: string; note?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { supplier = '', ref = '', date = '', desc = '' } = await req.json();
    if (!anthropicKey()) return NextResponse.json({ error: 'The Anthropic key (ANTHROPIC_KEY) is not set in Vercel.' }, { status: 500 });
    const token = await gmailToken();

    // Find the email: first search that turns up a PDF wins.
    let pick: { msgId: string; part: GmailPart; subject: string } | null = null;
    for (const q of searches(String(supplier), String(ref), String(date))) {
      const list = await gmail<{ messages?: { id: string }[] }>(`/messages?q=${encodeURIComponent(q)}&maxResults=5`, token);
      for (const m of list.messages ?? []) {
        const msg = await gmail<GmailMessage>(`/messages/${m.id}?format=full`, token);
        const parts = pdfParts(msg.payload?.parts ?? (msg.payload ? [msg.payload] : []));
        if (!parts.length) continue;
        // Prefer the attachment whose file name carries the reference.
        const refDigits = String(ref).replace(/\D/g, '');
        const part = parts.find(p => refDigits.length >= 4 && (p.filename ?? '').replace(/\D/g, '').includes(refDigits)) ?? parts[0];
        pick = { msgId: m.id, part, subject: header(msg, 'subject') };
        break;
      }
      if (pick) break;
    }
    if (!pick) return NextResponse.json({ found: false, note: 'No email with a PDF found for this bill.' } satisfies ReadBillResult);

    const b64 = await pdfBase64(pick.msgId, pick.part, token);
    if (!b64) return NextResponse.json({ found: false, note: 'The PDF could not be downloaded.' } satisfies ReadBillResult);

    const client = new Anthropic({ apiKey: anthropicKey() });
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: `This PDF came with an email to M J Hunt & Son (a farm). The Hub has it logged as a bill from "${supplier}", ref "${ref}", dated ${date}${desc ? ` (${desc})` : ''}. Say what kind of document it is and read the amounts in pounds as printed (net, VAT, total). Use null for any amount that isn't shown. Dates as YYYY-MM-DD.` },
        ],
      }],
    } as Parameters<typeof client.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;

    if (response.stop_reason === 'refusal') return NextResponse.json({ found: false, note: 'Claude declined to read this one.' } satisfies ReadBillResult);
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text);
    return NextResponse.json({ found: true, ...parsed, fileName: pick.part.filename, subject: pick.subject } satisfies ReadBillResult);
  } catch (e) {
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Claude error ${e.status}: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
