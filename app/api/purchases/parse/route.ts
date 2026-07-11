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

// PDF line structure (from real Crop Advisors PDFs):
//
// line 4:  "Crop Advisors Fertiliser Purchase Order Number:"
// line 24: "Sep-2025 Date of Order:"   ← payment month embedded here
// line 40: "F584610"                   ← standalone ref
// line 41: "6 June 2025"              ← date
// line 49: "Bartholomews Agri Food Ltd"  ← supplier (before Account Reference:)
// line 56: "Account Reference:"
// line 67: "Brand"                     ← product block header
// line 68: product name
// line 69: "Quantity"
// line 70: "52 Tonnes"
// line 71: "Bag Size"
// line 72: "1000 kg"
// line 73: "Price"
// line 74: "£324.00"
// line 75: "Unit"
// line 76: "Per Tonne"

function parsePdfText(text: string, filename: string): PurchaseOrder | null {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // 1. Order ref — standalone line matching F/C/S + digits
  let ref = '';
  let refIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^[FCS]\d{5,}$/.test(lines[i])) {
      ref = lines[i];
      refIdx = i;
      break;
    }
  }
  if (!ref) return null;

  const type: PurchaseOrder['type'] = ref.startsWith('F') ? 'Fertiliser'
    : ref.startsWith('C') ? 'Chemical'
    : ref.startsWith('S') ? 'Seed'
    : 'Other';

  // 2. Date — line immediately after ref
  const date = refIdx >= 0 && refIdx + 1 < lines.length ? lines[refIdx + 1] : '';

  // 3. Payment due — embedded in line like "Sep-2025 Date of Order:"
  let paymentDue = '';
  for (const line of lines) {
    const m = line.match(/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4})\s+Date of Order/i);
    if (m) { paymentDue = m[1]; break; }
  }

  // 4. Supplier — lines before "Account Reference:" (first non-address company name)
  let supplier = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^Account Reference:/.test(lines[i])) {
      // Walk back to find supplier company name — skip addresses, phones, emails, postcodes
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        const l = lines[j];
        if (/^[A-Z]{1,2}\d+\s*\d[A-Z]{2}$/i.test(l)) continue; // postcode
        if (/^\d[\d\s\-\(\)]+$/.test(l)) continue;              // phone
        if (/@/.test(l)) continue;                               // email
        if (/^(Tel|Fax|Mobile|Email|Contact|Address|Delivery|Account):?$/i.test(l)) continue;
        if (l.length < 4) continue;
        // Skip short county/town names (no Ltd/Ltd/Agri in them, just a place name)
        if (/^(West Sussex|East Sussex|North Yorkshire|South Yorkshire|West Yorkshire|East Yorkshire|Greater Manchester|Tyne and Wear|County Durham|Northumberland|Cumbria|Lancashire|Cheshire|Shropshire|Staffordshire|Derbyshire|Nottinghamshire|Leicestershire|Lincolnshire|Rutland|Northamptonshire|Warwickshire|Worcestershire|Herefordshire|Gloucestershire|Oxfordshire|Buckinghamshire|Hertfordshire|Bedfordshire|Cambridgeshire|Norfolk|Suffolk|Essex|Kent|Surrey|Hampshire|Berkshire|Wiltshire|Dorset|Somerset|Devon|Cornwall)$/i.test(l)) continue;
        supplier = l;
        break;
      }
      break;
    }
  }

  // 5. Products — structured block starting at "Brand"
  const products: PurchaseProduct[] = [];
  let brandIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'Brand') { brandIdx = i; break; }
  }

  if (brandIdx >= 0) {
    // After "Brand", lines come in groups:
    // product_name, "Quantity", qty+unit, "Bag Size", bagsize, "Price", £price, "Unit", per_unit
    // There may be multiple products, each group following the same pattern
    let i = brandIdx + 1;
    while (i < lines.length) {
      // Stop at footer
      if (/^\d{2}\s+\w{3}\s+\d{4}/.test(lines[i])) break;
      if (/^Orders by Crop Advisors/.test(lines[i])) break;
      if (/^Page \d/.test(lines[i])) break;

      // Expect: product name, then "Quantity", then "X Tonnes/Litres/Kg"
      const productName = lines[i];
      if (i + 1 < lines.length && lines[i + 1] === 'Quantity') {
        const qtyLine = lines[i + 2] || '';
        const qtyMatch = qtyLine.match(/^(\d+(?:\.\d+)?)\s+(Tonnes|Litres|Kg)$/i);
        if (qtyMatch) {
          const qty = parseFloat(qtyMatch[1]);
          const unit = qtyMatch[2];
          // Skip "Bag Size" label
          const bagSizeLabel = lines[i + 3] || '';
          const bagSize = bagSizeLabel === 'Bag Size' ? (lines[i + 4] || '') : bagSizeLabel;
          const offset = bagSizeLabel === 'Bag Size' ? 5 : 4;
          // Skip "Price" label
          const priceLabel = lines[i + offset] || '';
          const priceStr = priceLabel === 'Price' ? (lines[i + offset + 1] || '') : priceLabel;
          const price = parseFloat(priceStr.replace(/[£,]/g, ''));
          // Skip "Unit" label
          const unitLabel = lines[i + offset + (priceLabel === 'Price' ? 2 : 1)] || '';
          const perUnitStr = unitLabel === 'Unit'
            ? (lines[i + offset + (priceLabel === 'Price' ? 3 : 2)] || '')
            : unitLabel;
          const perUnit = perUnitStr.replace(/^Per\s+/i, '');

          if (!isNaN(price) && price > 0) {
            products.push({
              name: productName.trim(),
              quantity: qty,
              unit,
              bagSize: bagSize.trim(),
              pricePerUnit: price,
              priceUnit: `Per ${perUnit}`,
              totalValue: Math.round(qty * price * 100) / 100,
            });
          }
          // Advance past this product block (name + Quantity + qty + BagSize + bagsize + Price + price + Unit + perUnit)
          i += offset + (priceLabel === 'Price' ? 4 : 3);
          continue;
        }
      }
      i++;
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
        error: 'Could not find order number in PDF — make sure it is a Crop Advisors order confirmation',
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
