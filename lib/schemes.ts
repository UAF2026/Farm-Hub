// Scheme agreements and what they pay (from the Field & Scheme Inventory, 23 Aug 2026).
export const SCHEME_INCOME = [
  { id: 'sfi1', name: 'SFI 1', ref: 'UAF332270030', annual: 56074, ends: '2027-03-31', status: 'active' as const },
  { id: 'sfi2', name: 'SFI 2', ref: 'M J Hunt & Son 24', annual: 38418, ends: '2027-11-30', status: 'active' as const },
  { id: 'sfi3', name: 'SFI 3', ref: 'M J Hunt & Son 25E', annual: 9300, ends: '2028-09-30', status: 'active' as const },
  { id: 'cs',   name: 'CS Agreement', ref: '1255553', annual: 44734, ends: '2026-12-31', status: 'active' as const },
];

/** What the current agreements pay for one calendar year, pro rata to each end date.
 *  Leaves out anything not yet agreed (SFI26, a new CS Higher Tier). */
export function schemeIncomeFor(year: number): { total: number; lines: { name: string; amount: number }[] } {
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  const lines = SCHEME_INCOME.map(s => {
    const stop = Math.min(end, Date.parse(s.ends + 'T00:00:00Z') + 86400000);
    const share = Math.max(0, stop - start) / (end - start);
    return { name: s.name, amount: Math.round(s.annual * share) };
  }).filter(l => l.amount > 0);
  return { total: lines.reduce((a, l) => a + l.amount, 0), lines };
}
