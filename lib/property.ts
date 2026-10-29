import type { PrivateProperty, PropertyEntry } from './types';

// Private property money, kept apart from the farm accounts. Years run on the
// UK tax year (6 April to 5 April), which is how rental profit is reported.

export const PROPERTY_CATEGORIES = {
  income: ['Rental income', 'Other income'],
  cost: ['Agent commission', 'Cleaning & laundry', 'Repairs & maintenance', 'Safety checks', 'Utilities', 'Waste', 'Insurance',
    'Council tax / business rates', 'Furnishings', 'Mortgage interest', 'Other'],
};

/** Tax year an ISO date falls in, as '2026/27'. */
export function taxYear(date: string): string {
  const y = Number(date.slice(0, 4));
  const start = date.slice(5) >= '04-06' ? y : y - 1;
  return `${start}/${String(start + 1).slice(2)}`;
}

export function currentTaxYear(today = new Date().toISOString().slice(0, 10)) { return taxYear(today); }

export function yearSummary(p: PrivateProperty, year: string) {
  const es = p.entries.filter(e => e.date && taxYear(e.date) === year);
  const income = es.filter(e => e.kind === 'income').reduce((a, e) => a + (e.amount || 0), 0);
  const costs = es.filter(e => e.kind === 'cost').reduce((a, e) => a + (e.amount || 0), 0);
  const byCat = new Map<string, number>();
  for (const e of es.filter(x => x.kind === 'cost')) byCat.set(e.category, (byCat.get(e.category) || 0) + (e.amount || 0));
  return {
    income, costs, profit: income - costs, count: es.length,
    missing: es.filter(e => !e.amount).length,
    byCat: Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]),
  };
}

export const needsPropertyAmount = (e: PropertyEntry) => e.kind === 'cost' && !e.amount && !e.readTried;
