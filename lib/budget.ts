import type { FarmData, FieldYield, CropBudgetLine, MarginGroup } from './types';
import { computeMargins, settingsFor, priceForGroup, type MarginResult } from './cropMargins';
import { seasonForHarvest } from './fields';
import { schemeIncomeFor } from './schemes';

// Money → Budget. Next harvest's crops from the cropping plan, costed at what
// the same crop really cost per hectare last harvest (Crop margins). Yields and
// prices come from the plan where they've been filled in, else last harvest's.
// Anything typed on the Budget page wins (data.cropBudget[harvest].lines).

export interface BudgetCrop {
  id: string;                 // 'winter-wheat', 'spring-wheat', 'winter-barley', 'ahiflower', 'grange'
  label: string;
  basis: MarginGroup;         // which of last harvest's crops the costs come from
  fields: { name: string; areaHa: number }[];
  areaHa: number;
  yieldTha: number | null; yieldSource: string;
  price: number | null; priceSource: string;
  planHint: string;           // what the cropping plan says, when it differs
  seedPerHa: number; fertPerHa: number; sprayPerHa: number;
  costSource: string;
  directPerHa: number;
  outputPerHa: number | null;
  marginPerHa: number | null;
  margin: number | null;
  costPerT: number | null;
}

export interface BudgetResult {
  harvest: string;
  lastHarvest: string;
  crops: BudgetCrop[];
  own: { areaHa: number; output: number; direct: number; margin: number; complete: boolean };
  grange: { ourIncome: number | null; contractorsFee: number; ourShare: number | null } | null;
  overheads: number;
  schemeIncome: number;
  schemeNote: string;
  net: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

const CROPS: Record<string, { id: string; label: string; basis: MarginGroup }> = {
  'Winter wheat': { id: 'winter-wheat', label: 'Winter wheat', basis: 'milling' },
  'Spring wheat': { id: 'spring-wheat', label: 'Spring wheat', basis: 'wildfarmed' },
  'Winter barley': { id: 'winter-barley', label: 'Winter barley', basis: 'barley' },
  'Ahiflower': { id: 'ahiflower', label: 'Ahiflower', basis: 'ahiflower' },
};

/** Grange is the Knowles contract farming land: its own line (the profit is split),
 *  costed like whatever crop it's growing (Grange's own wheat costs if wheat). */
function cropFor(planCrop: string, fieldName: string): { id: string; label: string; basis: MarginGroup } | null {
  const c = CROPS[planCrop];
  if (!c) return null;
  if (/^grange$/i.test(fieldName.trim())) {
    return { id: 'grange', label: `Grange ${c.label.toLowerCase()} (50/50 share)`, basis: planCrop === 'Winter wheat' ? 'grange' : c.basis };
  }
  return c;
}

/** Area-weighted £/ha of one cost across last harvest's fields of a crop. */
function lastCost(last: MarginResult, g: MarginGroup, k: 'seedPerHa' | 'fertPerHa' | 'sprayPerHa' | 'extrasPerHa') {
  const fs = last.fields.filter(f => f.group === g);
  const ha = sum(fs.map(f => f.areaHa));
  return ha ? sum(fs.map(f => f[k] * f.areaHa)) / ha : 0;
}

export function computeBudget(db: FarmData, yields: FieldYield[], harvest = '2027', last?: MarginResult): BudgetResult {
  const lastHarvest = String(Number(harvest) - 1);
  const lm = last ?? computeMargins(db, yields, lastHarvest);
  const ls = settingsFor(db, lastHarvest);
  const mine = db.cropBudget?.[harvest];
  const plan = (db.croppingPlans || []).find(p => p.season === seasonForHarvest(Number(harvest)))?.plans || [];

  const byId = new Map<string, { label: string; basis: MarginGroup; rows: typeof plan }>();
  for (const row of plan) {
    const c = cropFor(row.plannedCrop, row.fieldName);
    if (!c || !(row.areaHa > 0)) continue;
    if (!byId.has(c.id)) byId.set(c.id, { label: c.label, basis: c.basis, rows: [] });
    byId.get(c.id)!.rows.push(row);
  }

  const order = ['winter-wheat', 'spring-wheat', 'winter-barley', 'ahiflower', 'grange'];
  const crops: BudgetCrop[] = Array.from(byId.entries())
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([id, { label, basis, rows }]) => {
      const typed: CropBudgetLine = mine?.lines[id] ?? {};
      const areaHa = sum(rows.map(r => r.areaHa));
      const lg = lm.groups.find(g => g.id === basis);
      const lastLabel = lg?.label.toLowerCase() ?? basis;

      // Yield and price: typed → last harvest's real figure → cropping plan.
      // (The plan's targets are mostly placeholders, so they're shown as a hint.)
      const planY = rows.filter(r => isNum(r.targetYieldTha) && (r.targetYieldTha as number) > 0);
      const planYHa = sum(planY.map(r => r.areaHa));
      const planYield = planYHa > 0 ? sum(planY.map(r => (r.targetYieldTha as number) * r.areaHa)) / planYHa : null;
      const planP = rows.filter(r => isNum(r.estimatedPricePerT) && (r.estimatedPricePerT as number) > 0);
      const planPHa = sum(planP.map(r => r.areaHa));
      const planPrice = planPHa > 0 ? sum(planP.map(r => (r.estimatedPricePerT as number) * r.areaHa)) / planPHa : null;

      let yieldTha: number | null = null, yieldSource = '';
      if (isNum(typed.yieldTha)) { yieldTha = typed.yieldTha; yieldSource = 'yours'; }
      else if (lg?.yieldTha) { yieldTha = lg.yieldTha; yieldSource = `${lastHarvest} actual (${lastLabel})`; }
      else if (planYield !== null) { yieldTha = planYield; yieldSource = 'cropping plan target'; }

      let price: number | null = null, priceSource = '';
      const lastPrice = priceForGroup(ls, basis).price;
      if (isNum(typed.price)) { price = typed.price; priceSource = 'yours'; }
      else if (lastPrice !== null) { price = lastPrice; priceSource = `${lastHarvest} price`; }
      else if (planPrice !== null) { price = planPrice; priceSource = 'cropping plan'; }

      const hint = [
        planYield !== null && yieldSource !== 'cropping plan target' && Math.abs(planYield - (yieldTha ?? 0)) > 0.05 ? `${planYield.toFixed(1)} t/ha` : '',
        planPrice !== null && priceSource !== 'cropping plan' && Math.abs(planPrice - (price ?? 0)) > 0.5 ? `£${Math.round(planPrice)}/t` : '',
      ].filter(Boolean).join(' at ');
      const planHint = hint ? `The cropping plan says ${hint}.` : '';

      const seedPerHa = isNum(typed.seedPerHa) ? typed.seedPerHa : lastCost(lm, basis, 'seedPerHa');
      const fertPerHa = isNum(typed.fertPerHa) ? typed.fertPerHa : lastCost(lm, basis, 'fertPerHa');
      const sprayPerHa = isNum(typed.sprayPerHa) ? typed.sprayPerHa : lastCost(lm, basis, 'sprayPerHa') + lastCost(lm, basis, 'extrasPerHa');
      const anyTyped = [typed.seedPerHa, typed.fertPerHa, typed.sprayPerHa].some(isNum);
      const costSource = `${lastHarvest} ${lastLabel}${anyTyped ? ', with your changes' : ''}`;

      const directPerHa = seedPerHa + fertPerHa + sprayPerHa;
      const outputPerHa = yieldTha !== null && price !== null ? yieldTha * price : null;
      const marginPerHa = outputPerHa === null ? null : outputPerHa - directPerHa;
      return {
        id, label, basis, fields: rows.map(r => ({ name: r.fieldName, areaHa: r.areaHa })).sort((a, b) => a.name.localeCompare(b.name)),
        areaHa, yieldTha, yieldSource, price, priceSource, planHint, seedPerHa, fertPerHa, sprayPerHa, costSource, directPerHa,
        outputPerHa, marginPerHa, margin: marginPerHa === null ? null : marginPerHa * areaHa,
        costPerT: yieldTha ? directPerHa / yieldTha : null,
      };
    });

  const own = crops.filter(c => c.id !== 'grange');
  const ownOut = {
    areaHa: sum(own.map(c => c.areaHa)),
    output: sum(own.map(c => (c.outputPerHa ?? 0) * c.areaHa)),
    direct: sum(own.map(c => c.directPerHa * c.areaHa)),
    margin: sum(own.map(c => c.margin ?? 0)),
    complete: own.every(c => c.margin !== null),
  };

  // Grange: same contract farming sums as Crop margins.
  const gc = crops.find(c => c.id === 'grange');
  let grange: BudgetResult['grange'] = null;
  if (gc) {
    const acres = gc.areaHa * 2.47105;
    const contractorsFee = acres * ls.grange.contractorsFeePerAc;
    const surplus = gc.outputPerHa === null ? null : gc.outputPerHa * gc.areaHa - gc.directPerHa * gc.areaHa - acres * ls.grange.farmersChargePerAc - contractorsFee;
    const ourShare = surplus === null ? null : (surplus * ls.grange.sharePct) / 100;
    grange = { contractorsFee, ourShare, ourIncome: ourShare === null ? null : contractorsFee + ourShare + (ls.grange.managementFee || 0) };
  }

  const oh = ls.overheads;
  const overheads = (oh.rent || 0) + (oh.labour || 0) + (oh.machinery || 0) + (oh.fuel || 0) + (oh.other || 0);
  // Scheme money: typed, else what the current agreements pay in that calendar year.
  const schemeDefault = schemeIncomeFor(Number(harvest));
  const schemeTyped = isNum(mine?.schemeIncome);
  const schemeIncome = schemeTyped ? mine!.schemeIncome! : schemeDefault.total;
  return {
    harvest, lastHarvest, crops, own: ownOut, grange, overheads, schemeIncome,
    schemeNote: schemeTyped ? 'your figure' : `agreements in place: ${schemeDefault.lines.map(l => `${l.name} £${l.amount.toLocaleString('en-GB')}`).join(', ')}. No SFI26 or new CS yet`,
    net: ownOut.margin + (grange?.ourIncome || 0) - overheads + schemeIncome,
  };
}
