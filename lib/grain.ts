import type { FarmData, GrainSale, GrainSaleStatus, GrainMarketPrice } from './types';

// Grain sales: contracts read from data.grainTrading.sales. Older shapes are
// still read so nothing goes missing:
//  - positions[] of flat Heygates-style contract records (contractNo, quantityTonnes…)
//  - positions[] of { cropYear, contracts: [...] } from the first Grain Trading screen

export const OUR_SELLER = 'M J Hunt & Son';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** '01-30 September 2026' → ['2026-09-01', '2026-09-30'] */
export function parseMovementWindow(text: string | undefined): [string, string] | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[3].slice(0, 3).toLowerCase());
  if (mon < 0) return null;
  return [iso(+m[4], mon, +m[1]), iso(+m[4], mon, +m[2])];
}

function legacyStatus(text: string, invoiced: boolean, priced: boolean): GrainSaleStatus {
  const t = text.toLowerCase();
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('paid')) return 'paid';
  if (invoiced || t.includes('invoiced')) return 'invoiced';
  if (t.includes('delivered')) return 'delivered';
  return priced ? 'priced' : 'open';
}

/** Harvest year a crop year belongs to: '2025/26' → '2026'. */
const harvestOf = (cropYear: string) => (cropYear.includes('/') ? '20' + cropYear.split('/')[1] : cropYear);

export function grainSales(db: FarmData): GrainSale[] {
  const g = db.grainTrading;
  if (!g) return [];
  if (Array.isArray(g.sales)) return g.sales;
  const out: GrainSale[] = [];
  for (const p of (g.positions ?? []) as Record<string, any>[]) {
    if (Array.isArray(p.contracts)) {
      for (const c of p.contracts) {
        out.push({
          id: c.id, harvest: harvestOf(c.cropYear ?? p.cropYear ?? ''), crop: c.crop, buyer: c.buyer, seller: OUR_SELLER,
          contractNo: c.contractRef, contractDate: c.contractDate, quantityTonnes: c.tonnes, deliveredTonnes: c.deliveredTonnes,
          basePricePerTonne: c.pricePerTonne, premiumPerTonne: 0, movementFrom: c.deliveryFrom, movementTo: c.deliveryTo,
          status: c.status === 'open' ? 'priced' : c.status, notes: c.notes,
        });
      }
    } else if (p.contractNo || p.quantityTonnes) {
      const base = Number(p.basePricePerTonne) || null;
      const win = parseMovementWindow(p.movementWindow);
      out.push({
        id: 'gs-' + (p.contractNo ?? out.length),
        harvest: p.harvest ?? (p.contractDate && p.contractDate >= '2026-01-01' ? '2026' : '2025'),
        crop: p.crop ?? 'Wheat', buyer: p.buyer ?? '', seller: p.seller ?? OUR_SELLER, contractNo: p.contractNo,
        contractDate: p.contractDate, amendedDate: p.amendedDate, quantityTonnes: Number(p.quantityTonnes) || 0,
        deliveredTonnes: Number(p.deliveredTonnes) || 0, basePricePerTonne: base, premiumPerTonne: Number(p.premiumPerTonne) || 0,
        movementFrom: win?.[0], movementTo: win?.[1],
        status: legacyStatus(p.status ?? '', !!p.invoiceNo, base !== null),
        invoiceNo: p.invoiceNo, invoiceDate: p.invoiceDate, invoiceNetPayable: p.invoiceNetPayable,
        paymentDueDate: p.paymentDueDate, paymentTerms: p.paymentTerms, notes: p.notes,
      });
    }
  }
  return out;
}

export const isPriced = (s: GrainSale) => !!s.basePricePerTonne && s.basePricePerTonne > 0;
export const pricePerT = (s: GrainSale) => (isPriced(s) ? (s.basePricePerTonne as number) + (s.premiumPerTonne ?? 0) : null);
export const isOurs = (s: GrainSale) => !s.seller || (/hunt\s*&\s*son/i.test(s.seller) && !/c\/o/i.test(s.seller));

/** 'Nov-26' / 'May-27 (old crop)' → first day of that month, or null. */
function marketMonth(label: string): string | null {
  const m = label.match(/([A-Za-z]{3})[-\s]?(\d{2})/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  return mon < 0 ? null : iso(2000 + +m[2], mon, 1);
}

/** Market price nearest to when an unpriced contract moves (for an estimate only). */
export function marketFor(s: GrainSale, market: GrainMarketPrice[]): GrainMarketPrice | null {
  const when = s.movementFrom ?? s.movementTo ?? '';
  let best: GrainMarketPrice | null = null; let bestGap = Infinity;
  for (const m of market) {
    const d = marketMonth(m.contract);
    if (!d || !when) continue;
    const gap = Math.abs(new Date(d).getTime() - new Date(when).getTime());
    if (gap < bestGap) { bestGap = gap; best = m; }
  }
  return best ?? market[0] ?? null;
}

export interface SalesSummary {
  tonnes: number;              // contracted, not cancelled
  fixedTonnes: number;
  fixedValue: number;
  floatingTonnes: number;
  estFloatingValue: number;    // floating tonnes at market + premium
  avgFixed: number | null;
  avgAll: number | null;       // fixed + estimated floating
  delivered: number;
}

export function summarise(sales: GrainSale[], market: GrainMarketPrice[]): SalesSummary {
  const live = sales.filter(s => s.status !== 'cancelled');
  let fixedTonnes = 0, fixedValue = 0, floatingTonnes = 0, estFloatingValue = 0, delivered = 0;
  for (const s of live) {
    // Once delivered, count what actually went, not the contract figure.
    const t = s.deliveredTonnes && s.deliveredTonnes > 0 && ['delivered', 'invoiced', 'paid'].includes(s.status) ? s.deliveredTonnes : s.quantityTonnes;
    delivered += s.deliveredTonnes ?? 0;
    const p = pricePerT(s);
    if (p !== null) { fixedTonnes += t; fixedValue += t * p; }
    else {
      floatingTonnes += t;
      const m = marketFor(s, market);
      if (m) estFloatingValue += t * (m.pricePerTonne + (s.premiumPerTonne ?? 0));
    }
  }
  const tonnes = fixedTonnes + floatingTonnes;
  return {
    tonnes, fixedTonnes, fixedValue, floatingTonnes, estFloatingValue, delivered,
    avgFixed: fixedTonnes ? fixedValue / fixedTonnes : null,
    avgAll: tonnes && (floatingTonnes === 0 || estFloatingValue > 0) ? (fixedValue + estFloatingValue) / tonnes : null,
  };
}
