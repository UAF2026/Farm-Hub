import { NextRequest, NextResponse } from 'next/server';
import type { PurchaseOrder, PurchaseProduct } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function extractTextFromPdfBytes(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const textBlocks: string[] = [];
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    const strRegex = /\(([^)]*)\)\s*Tj|\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/g;
    let strMatch;
    while ((strMatch = strRegex.exec(block)) !== null) {
      if (strMatch[1] !== undefined) {
        textBlocks.push(strMatch[1]);
      } else if (strMatch[2] !== undefined) {
        const tjContent = strMatch[2];
        const tjStrings = tjContent.match(/\(([^)]*)\)/g) || [];
        textBlocks.push(tjStrings.map(s => s.slice(1, -1)).join(''));
      }
    }
  }
  return textBlocks.join(' ').replace(/\\n/g, '\n').replace(/\\/g, '');
}

function parsePdfText(text: string, filename: string): PurchaseOrder | null {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const fullText = lines.join('\n');

  const refMatch = fullText.match(/Order Number:\s*([\w]+)/);
  if (!refMatch) return null;
  const ref = refMatch[1];

  const type: PurchaseOrder['type'] = ref.startsWith('F') ? 'Fertiliser'
    : ref.startsWith('C') ? 'Chemical'
    : ref.startsWith('S') ? 'Seed'
    : 'Other';

  const dateMatch = fullText.match(/Date of Order:\s*(.+?)(?:\n|$)/);
  const paymentMatch = fullText.match(/Payment Due:\s*(\S+)/);

  let supplier = '';
  for (const line of lines) {
    if (line.includes('Account Reference:')) {
      supplier = line.split('Account Reference:')[0].trim();
      break;
    }
  }

  const products: PurchaseProduct[] = [];
  let inProducts = false;
  for (const line of lines) {
    if (/^Brand\s+Quantity\s+Bag\s*Size\s+Price\s+Unit/.test(line)) {
      inProducts = true;
      continue;
    }
    if (inProducts) {
      if (/^\d{2}\s+\w{3}\s+\d{4}/.test(line)) break;
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

  const cancelled = filename.toLowerCase().includes('cancel');

  return {
    id: uid(),
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = extractTextFromPdfBytes(bytes);
    const order = parsePdfText(text, file.name);

    if (!order) {
      return NextResponse.json({
        ok: false,
        error: 'Could not find order number in PDF — make sure it is a Crop Advisors order confirmation',
        rawTextSample: text.slice(0, 300),
      }, { status: 422 });
    }

    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
