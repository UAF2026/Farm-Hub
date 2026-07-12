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

// pdf-parse (Node.js) extracts these PDFs with the following line structure:
//  0: "F584610"                                         ← order ref (standalone)
//  1: "Payment Due:Sep-2025Date of Order:6 June 2025"  ← payment + date combined
//  2: "Account:M J Hunt & Son"
//  ...
// 40: "Please contact Crop Advisors ASAP..."
// 41: "Bartholomews Agri Food Ltd"                      ← supplier (line after "Please contact...")
// ...
// 47: "Account Reference:"
// 48: "149059"
// 49: "BrandQuantityBag SizePriceUnit"                  ← header row (all merged)
// 50: "Fertiberia 26N+37SO352 Tonnes1000 kg£324.00Per Tonne"  ← product line
// 51: "06 Jun 2025 11:10Orders by Crop Advisors..."

function parsePdfText(text: string, filename: string): PurchaseOrder | null {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // 1. Order ref — standalone line matching F/C/S + 5+ digits (always line 0)
  let ref = '';
  for (const line of lines) {
    if (/^[FCS]\d{5,}$/.test(line)) { ref = line; break; }
  }
  if (!ref) return null;

  const type: PurchaseOrder['type'] = ref.startsWith('F') ? 'Fertiliser'
    : ref.startsWith('C') ? 'Chemical'
    : ref.startsWith('S') ? 'Seed'
    : 'Other';

  // 2. Payment due + date — combined on one line: "Payment Due:Sep-2025Date of Order:6 June 2025"
  let paymentDue = '';
  let date = '';
  for (const line of lines) {
    const m = line.match(/Payment Due:\s*(\S+?)Date of Order:\s*(.+)/i);
    if (m) {
      paymentDue = m[1].trim();
      date = m[2].trim();
      break;
    }
  }

  // 3. Supplier — line immediately after "Please contact Crop Advisors ASAP..."
  let supplier = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^Please contact Crop Advisors ASAP/i.test(lines[i])) {
      // Next non-empty line that isn't an address component
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (/^Account Reference:/.test(l)) break;
        if (/^[A-Z]{1,2}\d+\s*\d[A-Z]{2}$/i.test(l)) continue; // postcode
        if (/^\d[\d\s\-\(\)]+$/.test(l)) continue;              // phone
        if (/@/.test(l)) continue;                               // email
        if (l.length < 4) continue;
        supplier = l;
        break;
      }
      break;
    }
  }

  // 4. Products — line after "BrandQuantityBag SizePriceUnit" header
  // Format: "{name}{qty} Tonnes/Litres/Kg{bagsize}£{price}Per {unit}"
  // e.g. "Fertiberia 26N+37SO352 Tonnes1000 kg£324.00Per Tonne"
  const products: PurchaseProduct[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^BrandQuantity/i.test(lines[i])) {
      // Each subsequent line until footer is a product
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (/^\d{2}\s+\w{3}\s+\d{4}/.test(line)) break; // footer date
        if (/^Orders by Crop Advisors/.test(line)) break;

        // Parse: name + qty + unit + bagSize + £price + Per + perUnit
        const m = line.match(/^(.+?)(?<![A-Za-z])(\d+(?:\.\d+)?)\s+(Tonnes|Litres|Kg)\s*(.+?)£([\d,]+\.?\d*)\s*Per\s+(\w+)/i);
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
      break;
    }
  }

  const cancelled = filename.toLowerCase().includes('cancel');

  return {
    id: uid(),
    ref,
    type,
    date,
    paymentDue,
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParse(Buffer.from(bytes));
    const text: string = parsed.text || '';

    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'Could not extract text from PDF' }, { status: 422 });
    }

    const order = parsePdfText(text, file.name);

    if (!order) {
      return NextResponse.json({
        ok: false,
        error: 'Could not find order number — make sure this is a Crop Advisors order confirmation PDF',
        rawTextSample: text.slice(0, 500),
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
