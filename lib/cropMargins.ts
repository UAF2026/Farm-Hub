// Crop margins: what each field and crop made per hectare, before and after
// overheads. Costs are worked out by use, not by when the invoice came:
//
//   sprays     = Luke's Gatekeeper recs × the price paid (Crop Advisors final
//                terms), scaled by the share of the field each job covered
//   fertiliser = John Deere spreading records × the £/t set on screen
//                (a default rate per dressing where Deere has no measurement)
//   seed       = £/ha per crop, typed on screen
//
// Chemicals bought that no rec mentions (often a cheaper product with the
// same active, or a rec that's missing, e.g. 00003) are listed separately so
// James can say which crop they went on. Nothing here writes to the records;
// his inputs live in data.cropMargins[harvest].

import type { FarmData, MasterField, FieldYield, AgronomyJob, CropMarginSettings, MarginGroup, FieldMarginOverride } from './types';
import { findFieldByName, recordsForField, seasonForHarvest } from './fields';

export const GROUPS: { id: MarginGroup; label: string; note: string }[] = [
  { id: 'milling', label: 'Winter milling wheat', note: 'Heygates and Bix Skyfall' },
  { id: 'wildfarmed', label: 'Wildfarmed spring wheat', note: '' },
  { id: 'barley', label: 'Winter barley', note: 'Rowdow, fed to the cattle' },
  { id: 'ahiflower', label: 'Ahiflower', note: "Nature's Crops" },
  { id: 'grange', label: 'Grange wheat', note: '50/50 share with Knowles' },
];

/** Ahiflower: believed £830/t (contract not found), paid net of the deductions
 *  on the 2023 Nature's Crops statement. Weighbridge is £8.50 a load; loads
 *  assumed ~29 t. Tonnage is combine-only until it's loaded out. */
const AHI_GROSS = 830, AHI_LOAD_T = 29;
export const AHIFLOWER_NET_2026 = {
  gross: AHI_GROSS,
  net: Math.round((AHI_GROSS - 5 - 11 - 11 - 8.5 / AHI_LOAD_T + 13.4) * 100) / 100,
  detail: `£${AHI_GROSS}/t believed (not confirmed) − handling £5 − haulage £11 − R&D levy £11 − weighbridge £8.50/load (~£0.30/t) + storage credit ~£13.40`,
};

export const DEFAULT_SETTINGS: CropMarginSettings = {
  prices: {
    milling: 200,    // all winter wheat goes to Heygates through the year; James aims to average £200/t (28 Oct 2026)
    wildfarmed: 190, // rejected by Wildfarmed for too high protein, so sold as ordinary wheat (contract was £280 delivered)
    barley: 160,     // fed to the cattle; what feed barley would average
    ahiflower: AHIFLOWER_NET_2026.net,   // believed £830/t gross, NOT confirmed (contract not found); see below
  },
  seedPerHa: { wildfarmed: 47.5 },   // own seed (Ladum, Mylo) 250 kg/ha at £190/t; Lewknor and Big Lodge differ, see FIELD_INPUTS_2026
  anPricePerT: 340,
  sulphurPricePerT: 324,      // Fertiberia 26N + 37SO3, order of 6 June 2025
  // Where James knows the season's total better than the Deere records (kg/ha of product).
  fertKgHa: { ahiflower: { an: 430, sulphur: 150 } },   // ~3 passes of ~145 kg (JD rates on Hangins Hill and Steins Park). An estimate.
  anRateKgHa: 137,            // average of the dressings Deere did measure in 25/26
  sulphurRateKgHa: 135,
  chemPrices: {},
  extraUse: {},
  overrides: {},
  overheads: {},
  grange: { farmersChargePerAc: 100, contractorsFeePerAc: 125, sharePct: 50 },
};

export function settingsFor(db: FarmData, harvest: string): CropMarginSettings {
  const s = db.cropMargins?.[harvest];
  return { ...DEFAULT_SETTINGS, ...s, fertKgHa: { ...DEFAULT_SETTINGS.fertKgHa, ...s?.fertKgHa }, grange: { ...DEFAULT_SETTINGS.grange, ...s?.grange }, prices: { ...DEFAULT_SETTINGS.prices, ...s?.prices } };
}

/* ─── What was paid for chemicals, harvest 2026 ─────────────────────────────
 * From the Crop Advisors final-terms statements (Sep 2025 – Jun 2026, net of
 * credit notes, ex VAT). £ per litre, or per kg for granules. Twin packs are
 * split by volume. Nothing invoiced after 1 Sept 2026 is used. */

interface PaidPrice { price: number; unit: 'L' | 'kg'; source: string }
const SEP25 = 'Crop Advisors statement Sep–Nov 2025';
const DEC25 = 'Crop Advisors statement Dec 2025–Feb 2026';
const MAR26 = 'Crop Advisors statement Mar–Jun 2026';

const PAID_2026: Record<string, PaidPrice> = {
  'Picona': { price: 8.45, unit: 'L', source: SEP25 },
  'Vimoy': { price: 30, unit: 'L', source: `${SEP25} (twin pack £330 for 5 L Vimoy + 6 L Jessico One)` },
  'Jessico One': { price: 30, unit: 'L', source: `${SEP25} (twin pack £330 for 5 L Vimoy + 6 L Jessico One)` },
  'Luxinum Plus': { price: 23.78, unit: 'L', source: `${SEP25} (twin pack £321 for 3.5 L Luxinum Plus + 10 L Stomp Aqua)` },
  'Stomp Aqua': { price: 23.78, unit: 'L', source: `${SEP25} (twin pack £321 for 3.5 L Luxinum Plus + 10 L Stomp Aqua)` },
  'Roundup Vista Plus': { price: 6.59, unit: 'L', source: `${SEP25} and ${DEC25}` },
  'Fundatis': { price: 51, unit: 'L', source: SEP25 },
  'Avadex Factor': { price: 12.7, unit: 'L', source: SEP25 },
  'Centurion Max': { price: 16.95, unit: 'L', source: `${DEC25} and ${MAR26}` },
  'X-Change': { price: 5.52, unit: 'L', source: `${DEC25} and ${MAR26}` },
  'Eagle': { price: 608.33, unit: 'kg', source: `${MAR26} (£73 per 120 g)` },
  'Manganese': { price: 0.55, unit: 'L', source: `${MAR26} (Microwise Mn 15%, 1000 L)` },
  'Starane Hi-Load HL': { price: 11.18, unit: 'L', source: MAR26 },
  'Biopower': { price: 4.95, unit: 'L', source: MAR26 },
  'Bridgeway': { price: 10.04, unit: 'L', source: `${DEC25} and ${MAR26}: Zodiac, the Bridgeway equivalent used on the Ahiflower (70 L for £703)` },
  'Arizona': { price: 5.58, unit: 'L', source: MAR26 },
  'Soratel': { price: 9.07, unit: 'L', source: MAR26 },
  'Moddus': { price: 17.25, unit: 'L', source: MAR26 },
  'Boudha': { price: 440, unit: 'kg', source: `${MAR26} (£88 per 200 g)` },
  'Jackal': { price: 5.7, unit: 'L', source: MAR26 },
  // Same active and strength bought under another name:
  'Zonor': { price: 5.73, unit: 'L', source: `${MAR26}: Clayton Tebucon 250 EW (tebuconazole 25%, same as Zonor)` },
  'Shield Pro': { price: 23.5, unit: 'L', source: `${DEC25}: Cliophar 400 (clopyralid 40%, same as Shield Pro)` },
  'Lambdastar': { price: 68, unit: 'L', source: `${DEC25}: Hallmark With Zeon (lambda-cyhalothrin 10%, same as Lambdastar)` },
  'Comet 200': { price: 24.7, unit: 'L', source: `${MAR26}: Retengo 200 (pyraclostrobin 20%, same as Comet 200)` },
  // Bought as a generic or alternative, per James (28 Oct 2026):
  'Broadway Star': { price: 138.84, unit: 'kg', source: `${MAR26}: Palio, same chemistry (27 × 1.06 kg for £3,973.50)` },
  'Proclus': { price: 17.5, unit: 'L', source: `${SEP25}: Bianchi, generic Proclus (£175 per 10 L)` },
  'Clayton Facet XL': { price: 15.9, unit: 'L', source: `${SEP25}: Cropdart, used in its place (£79.50 per 5 L)` },
  'Phase II (methylated seed oil)': { price: 3.8, unit: 'L', source: `${MAR26}: Spraymate, used in its place (£19 per 5 L)` },
  'Proline 275': { price: 8.25, unit: 'L', source: `${MAR26}: Floozy, used in its place (£41.25 per 5 L)` },
  '3C Chlormequat 750': { price: 2.86, unit: 'L', source: 'IBC bought in 2023, £2,855 for 1000 L, lasting three seasons (James)' },
};

/** Prices seen only on orders after the cut-off: shown as a hint, never used. */
const LATER_PRICE_HINTS: Record<string, string> = {};

/** Farm-saved winter wheat seed for harvest 2026: CYO Seeds invoice 1006535,
 *  7 Oct 2025, cleaning + Beret Gold + royalty + one bulk bag on 10 t Skyfall
 *  and 15 t KWS Ultimatum, £3,901.25 ex VAT. The £421.11 credit charge (paid
 *  12 Nov, after the 4 Nov discount date) is a finance cost, so it's left out.
 *  Spread over all the winter wheat (Grange included), plus the value of the
 *  25 t of grain kept back, at the wheat price. */
export const SEED_WHEAT_2026 = { tonnes: 25, cash: 3901.25, source: 'CYO Seeds invoice 1006535 (7 Oct 2025)' };

/** Season totals per field for harvest 2026, from James (28 Oct 2026). kg/ha of
 *  product: 33.5% nitrogen and Fertiberia 26N+37SO3 (150 kg/ha on every crop).
 *  Seed £/ha where a field differs from its crop's default. These replace the
 *  John Deere dressings, whose rates were mostly never synced. */
const WW650 = { an: 650, sulphur: 150 }, WW550 = { an: 550, sulphur: 150 }, SW270 = { an: 270, sulphur: 150 };
export const FIELD_INPUTS_2026: Record<string, { an?: number; sulphur?: number; seedPerHa?: number; seedNote?: string }> = {
  'behind-keepers': WW650, 'big-oak': WW650, 'grange': WW650,
  'top-field-hollandridge': WW550, 'naiboss': WW550, 'borderleys': WW550, 'black-dean-pages': WW550, 'church': WW550,
  'freedom': WW550, 'sale-field': WW550, 'soundees': WW550, 'top-east': WW550, 'rowdow': WW550,
  'lewknor': { an: 340, sulphur: 150, seedPerHa: 149.75, seedNote: 'Cope Seeds WFG Spring 2026 Blend, £599/t at 250 kg/ha (inv 1234559, 15 Dec 2025)' },
  'big-lodge': { ...SW270, seedPerHa: 74.77, seedNote: '~4 ha of bought Cope blend (£149.75/ha), the rest own seed (£47.50/ha)' },
  'lodge-farm-field': SW270, 'spring-pit': SW270, 'fir-field': SW270, 'west-field': SW270, 'yew-tree-hill': SW270,
};

/** Bought in the 25/26 season but on none of Luke's recs (excludes the
 *  same-active products above, which are already costed through the rec). */
export const EXTRAS_2026: { name: string; total: number; bought: string; hint?: string; use?: string }[] = [
  { name: 'Katamaran Turbo', total: 5375.4, bought: '13 Nov 2025', hint: 'Bought for the Ahiflower but never used: still in store (James)', use: 'none' },
  { name: 'Tower', total: 570, bought: '13 Nov 2025', hint: 'Probably wheat (James)', use: 'milling' },
  { name: 'Airmid', total: 469, bought: '21 May 2026', hint: 'Probably wheat (James)', use: 'milling' },
  { name: 'Blusky', total: 356, bought: '26 May 2026', hint: 'Probably wheat (James)', use: 'milling' },
  { name: 'Liberator', total: 270, bought: '15 Oct 2025', hint: 'Probably wheat (James)', use: 'milling' },
  { name: 'Consort', total: 210, bought: '26 May 2026', hint: 'Probably wheat (James)', use: 'milling' },
  { name: 'Clayton Augusta', total: 200, bought: '27 Apr 2026', hint: 'Probably wheat (James)', use: 'milling' },
  { name: 'Clayton Cocoon', total: 141, bought: '11 May 2026', hint: 'Probably wheat (James)', use: 'milling' },
];
// Palio, Bianchi, Cropdart, Spraymate, Floozy and Zodiac were bought in place of rec
// products, so they're costed through the recs above, not here.

const key = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const PAID_BY_KEY = new Map(Object.entries(PAID_2026).map(([n, p]) => [key(n), p]));

export interface ChemPriceLine {
  name: string;
  price: number | null;      // £ per L or kg
  unit: 'L' | 'kg';
  source: string;            // '' when unpriced
  usedQty: number;           // L or kg the recs used across the costed fields
  cost: number;              // £ across the costed fields
  hint?: string;
}

function recUnit(u: string): { unit: 'L' | 'kg'; factor: number } {
  const x = (u || '').toLowerCase();
  if (x === 'g') return { unit: 'kg', factor: 0.001 };
  if (x === 'kg') return { unit: 'kg', factor: 1 };
  if (x === 'ml') return { unit: 'L', factor: 0.001 };
  return { unit: 'L', factor: 1 };
}

/* ─── The sum ───────────────────────────────────────────────────────────── */

export interface SprayLine { date: string; report: string; products: string; perHa: number; share: number; unpriced: string[] }
export interface FertLine { date: string; product: string; kgHa: number; measured: boolean; perHa: number }

export interface FieldMargin {
  id: string;                 // fieldRegister id ('plan:<GK code>' if the plan row has no register match)
  name: string;
  group: MarginGroup;
  areaHa: number;
  yieldTha: number | null;
  yieldSource: string;
  price: number | null;
  revenuePerHa: number | null;
  sprayPerHa: number;
  extrasPerHa: number;
  fertPerHa: number;
  seedPerHa: number;
  directPerHa: number;
  marginPerHa: number | null;
  costPerT: number | null;
  sprays: SprayLine[];
  ferts: FertLine[];
  fertSource: string;         // where the fertiliser £/ha came from
  unpriced: string[];
  override: FieldMarginOverride;
}

export interface GroupMargin {
  id: MarginGroup;
  label: string;
  note: string;
  fields: FieldMargin[];
  areaHa: number;
  tonnes: number;
  yieldTha: number | null;
  price: number | null;
  priceSource: string;        // '' = typed, else e.g. 'same as milling wheat'
  directPerHa: number;        // over the whole crop area
  // Margin only counts fields that have both a yield and a price:
  costedAreaHa: number;
  revenue: number;
  margin: number;
  marginPerHa: number | null;
  costPerT: number | null;
  missing: string[];          // fields left out of the margin (no yield or no price)
}

export interface MarginResult {
  harvest: string;
  fields: FieldMargin[];
  groups: GroupMargin[];
  chemPrices: ChemPriceLine[];
  extras: { name: string; total: number; bought: string; hint?: string; use: string }[];
  extrasUnassigned: number;
  grange: {
    areaHa: number; acres: number; revenue: number | null; direct: number;
    farmersCharge: number; contractorsFee: number; surplus: number | null; ourShare: number | null;
    managementFee: number; ourIncome: number | null;
  };
  whole: {
    ownAreaHa: number; ownMargin: number; ownComplete: boolean; grangeIncome: number | null;
    overheads: number; schemeIncome: number; net: number;    // net counts only what can be costed so far
  };
  notes: string[];   // things still missing
  info: string[];    // how some figures were worked out
}

const MARGIN_CROPS = ['Winter wheat', 'Spring wheat', 'Winter barley', 'Ahiflower'];

function groupFor(f: MasterField | undefined, planName: string, crop: string): MarginGroup | null {
  if (f?.id === 'grange' || /^grange$/i.test(planName.trim())) return 'grange';
  if (crop === 'Ahiflower') return 'ahiflower';
  if (crop === 'Spring wheat') return 'wildfarmed';
  if (crop === 'Winter barley') return 'barley';
  if (crop === 'Winter wheat') return 'milling';
  return null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

export function computeMargins(db: FarmData, yields: FieldYield[], harvest = '2026'): MarginResult {
  const s = settingsFor(db, harvest);
  const register = db.fieldRegister || [];
  const H = Number(harvest);
  const from = `${H - 1}-08-01`, to = `${H}-08-31`;
  const cutoff = `${H}-09-01`;
  const season = seasonForHarvest(H);
  const plan = (db.croppingPlans || []).find(p => p.season === season)?.plans || [];
  const notes: string[] = [];

  const regOf = (planRow: { fieldParcel: string; fieldName: string }) =>
    register.find(f => f.gkCodes?.includes(planRow.fieldParcel)) || findFieldByName(register, planRow.fieldName);

  // Prices: James's figure, else what was paid.
  const priceFor = (name: string): { price: number | null; unit: 'L' | 'kg'; source: string } => {
    const mine = s.chemPrices[name];
    const paid = PAID_BY_KEY.get(key(name));
    if (isNum(mine)) return { price: mine, unit: paid?.unit || 'L', source: 'Your price' };
    if (paid) return { price: paid.price, unit: paid.unit, source: paid.source };
    return { price: null, unit: 'L', source: '' };
  };

  // Luke's recs for this harvest (issued in the season and before the cut-off).
  const jobs: { report: string; date: string; job: AgronomyJob }[] = (db.agronomyVisits || [])
    .filter(v => v.issueDate >= from && v.issueDate < cutoff)
    .flatMap(v => v.jobs.map(job => ({ report: v.reportNo, date: v.issueDate, job })));
  const reports = new Set((db.agronomyVisits || []).filter(v => v.issueDate >= from && v.issueDate < cutoff).map(v => Number(v.reportNo.replace(/\D.*$/, ''))));
  const maxReport = Math.max(0, ...Array.from(reports));
  const missing = Array.from({ length: maxReport }, (_, i) => i + 1).filter(n => !reports.has(n)).map(n => String(n).padStart(5, '0'));
  if (missing.length) notes.push(`Gatekeeper rec${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing from the Hub, so ${missing.length > 1 ? 'those sprays aren’t' : 'that spray isn’t'} costed. Upload it under Agronomy recs when you find it.`);

  const chemUse = new Map<string, { qty: number; cost: number }>();
  const jobFieldIds = new Map<string, string | undefined>();
  const jobFieldId = (name: string) => {
    if (!jobFieldIds.has(name)) jobFieldIds.set(name, findFieldByName(register, name)?.id);
    return jobFieldIds.get(name);
  };

  // Winter wheat seed per ha (cash for cleaning/dressing/royalty + grain kept back).
  const wheatHa = sum(plan.filter(p => p.plannedCrop === 'Winter wheat').map(p => p.areaHa || 0));
  const grainValue = priceForGroup(s, 'milling').price ?? 0;
  const wheatSeedPerHa = harvest === '2026' && wheatHa > 0 ? (SEED_WHEAT_2026.cash + SEED_WHEAT_2026.tonnes * grainValue) / wheatHa : null;
  const info: string[] = [];
  if (harvest === '2026') info.push(`Ahiflower price: ${AHIFLOWER_NET_2026.detail} = £${AHIFLOWER_NET_2026.net}/t net.`);
  if (wheatSeedPerHa !== null) info.push(`Winter wheat seed: ${SEED_WHEAT_2026.tonnes} t farm-saved over ${wheatHa.toFixed(1)} ha (${Math.round(SEED_WHEAT_2026.tonnes * 1000 / wheatHa)} kg/ha), £${Math.round(SEED_WHEAT_2026.cash / wheatHa)}/ha cleaning, dressing and royalty (${SEED_WHEAT_2026.source}) + £${Math.round(SEED_WHEAT_2026.tonnes * grainValue / wheatHa)}/ha for the grain kept back at £${grainValue}/t.`);

  const fieldRows: FieldMargin[] = [];
  for (const row of plan) {
    if (!MARGIN_CROPS.includes(row.plannedCrop)) continue;
    const reg = regOf(row);
    const group = groupFor(reg, row.fieldName, row.plannedCrop);
    if (!group) continue;
    const id = reg?.id || `plan:${row.fieldParcel}`;
    const o = s.overrides[id] || {};
    const areaHa = isNum(o.areaHa) ? o.areaHa : row.areaHa || reg?.areaHa || 0;

    // Yield: typed here, else the yields table, else the cropping plan.
    const y = reg ? yields.find(r => r.field_id === id && String(r.harvest_year) === harvest && isNum(Number(r.yield_t_per_ha)) && r.yield_t_per_ha !== null) : undefined;
    let yieldTha: number | null = null, yieldSource = '';
    if (isNum(o.yieldTha)) { yieldTha = o.yieldTha; yieldSource = 'typed here'; }
    else if (y) { yieldTha = Number(y.yield_t_per_ha); yieldSource = 'yields table'; }
    else if (isNum(row.actualYieldTha) && row.actualYieldTha > 0) { yieldTha = row.actualYieldTha; yieldSource = 'cropping plan'; }

    // Sprays from the recs.
    const sprays: SprayLine[] = [];
    const unpriced = new Set<string>();
    for (const { report, date, job } of jobs) {
      // A rec can list one field under two names (Top East + Top Top East before they were merged).
      const jfs = job.fields.filter(x => (reg ? jobFieldId(x.name) === reg.id : x.name.trim().toLowerCase() === row.fieldName.trim().toLowerCase()));
      if (!jfs.length) continue;
      const jobArea = sum(jfs.map(x => x.areaHa || 0));
      const share = areaHa > 0 && jobArea > 0 ? Math.min(1, jobArea / areaHa) : 1;
      let perHa = 0;
      const missingHere: string[] = [];
      for (const p of job.products) {
        const { factor } = recUnit(p.unit);
        const qtyHa = (p.ratePerHa || 0) * factor;
        const pr = priceFor(p.name);
        const u = chemUse.get(p.name) || { qty: 0, cost: 0 };
        u.qty += qtyHa * share * areaHa;
        if (pr.price === null) { missingHere.push(p.name); unpriced.add(p.name); }
        else { perHa += qtyHa * pr.price; u.cost += qtyHa * pr.price * share * areaHa; }
        chemUse.set(p.name, u);
      }
      sprays.push({ date, report, products: job.products.map(p => p.name).join(', '), perHa: perHa * share, share, unpriced: missingHere });
    }
    const sprayFromRecs = sum(sprays.map(x => x.perHa));

    // Fertiliser from John Deere: one dressing per day per product.
    const ferts: FertLine[] = [];
    if (reg) {
      const recs = recordsForField(reg, db.fertilisers || []).filter(r => r.date >= from && r.date <= to && !/muck|manure|fym|slurry|digestate/i.test(r.product || ''));
      const byDay = new Map<string, typeof recs>();
      for (const r of recs) {
        const k = `${r.date}|${r.product}`;
        byDay.set(k, [...(byDay.get(k) || []), r]);
      }
      for (const [k, rs] of Array.from(byDay.entries()).sort()) {
        const [date, product] = k.split('|');
        const sulphur = /sulph|so3/i.test(product);
        // Trust Deere's rate only where it measured a real piece of the field (not a 0.03 ha blip).
        const measured = rs.filter(r => r.ratePerHa > 0 && r.area >= Math.min(1, areaHa * 0.25));
        const kgHa = measured.length
          ? sum(measured.map(r => r.ratePerHa * r.area)) / sum(measured.map(r => r.area))
          : sulphur ? s.sulphurRateKgHa : s.anRateKgHa;
        const perT = sulphur ? s.sulphurPricePerT : s.anPricePerT;
        ferts.push({ date, product, kgHa, measured: measured.length > 0, perHa: (kgHa * perT) / 1000 });
      }
    }

    const sprayPerHa = isNum(o.sprayPerHa) ? o.sprayPerHa : sprayFromRecs;
    const fi = harvest === '2026' ? FIELD_INPUTS_2026[id] : undefined;
    const fertPlan = fi?.an !== undefined ? { an: fi.an, sulphur: fi.sulphur ?? 0 } : s.fertKgHa?.[group];
    const fertFromPlan = fertPlan ? (fertPlan.an * s.anPricePerT + fertPlan.sulphur * s.sulphurPricePerT) / 1000 : null;
    const fertPerHa = isNum(o.fertPerHa) ? o.fertPerHa : fertFromPlan ?? sum(ferts.map(f => f.perHa));
    const seedPerHa = isNum(o.seedPerHa) ? o.seedPerHa : isNum(fi?.seedPerHa) ? fi!.seedPerHa! : s.seedPerHa[group] ?? (wheatSeedPerHa !== null && (group === 'milling' || group === 'grange') ? wheatSeedPerHa : 0);
    const price = priceForGroup(s, group).price;

    fieldRows.push({
      id, name: reg?.name || row.fieldName, group, areaHa, yieldTha, yieldSource, price,
      revenuePerHa: yieldTha !== null && isNum(price) ? yieldTha * price : null,
      sprayPerHa, extrasPerHa: 0, fertPerHa, seedPerHa, directPerHa: 0, marginPerHa: null, costPerT: null,
      sprays, ferts, unpriced: Array.from(unpriced), override: o,
      fertSource: isNum(o.fertPerHa) ? 'typed here' : fertPlan ? `your season total: ${fertPlan.an} kg/ha nitrogen + ${fertPlan.sulphur} kg/ha sulphur` : 'John Deere dressings',
    });
  }

  // Chemicals bought but not on a rec, spread per ha over the crop James picks.
  const extras = EXTRAS_2026.map(e => ({ ...e, use: s.extraUse[e.name] ?? e.use ?? '' }));
  for (const e of extras) {
    const g = GROUPS.find(x => x.id === e.use);
    if (!g) continue;
    const rows = fieldRows.filter(f => f.group === g.id);
    const ha = sum(rows.map(f => f.areaHa));
    if (ha > 0) for (const f of rows) if (!isNum(f.override.sprayPerHa)) f.extrasPerHa += e.total / ha;
  }
  const extrasUnassigned = sum(extras.filter(e => !e.use).map(e => e.total));

  for (const f of fieldRows) {
    f.directPerHa = f.sprayPerHa + f.extrasPerHa + f.fertPerHa + f.seedPerHa;
    f.marginPerHa = f.revenuePerHa === null ? null : f.revenuePerHa - f.directPerHa;
    f.costPerT = f.yieldTha ? f.directPerHa / f.yieldTha : null;
  }

  const groups: GroupMargin[] = GROUPS.map(g => {
    const fields = fieldRows.filter(f => f.group === g.id).sort((a, b) => a.name.localeCompare(b.name));
    const areaHa = sum(fields.map(f => f.areaHa));
    const withYield = fields.filter(f => f.yieldTha !== null);
    const tonnes = sum(withYield.map(f => (f.yieldTha || 0) * f.areaHa));
    const yieldArea = sum(withYield.map(f => f.areaHa));
    const costed = fields.filter(f => f.marginPerHa !== null);
    const costedAreaHa = sum(costed.map(f => f.areaHa));
    const revenue = sum(costed.map(f => (f.revenuePerHa || 0) * f.areaHa));
    const margin = sum(costed.map(f => (f.marginPerHa || 0) * f.areaHa));
    const direct = sum(fields.map(f => f.directPerHa * f.areaHa));
    const { price, source } = priceForGroup(s, g.id);
    return {
      ...g, fields, areaHa, tonnes, price, priceSource: source,
      yieldTha: yieldArea ? tonnes / yieldArea : null,
      directPerHa: areaHa ? direct / areaHa : 0,
      costedAreaHa, revenue, margin,
      marginPerHa: costedAreaHa ? margin / costedAreaHa : null,
      costPerT: yieldArea ? sum(withYield.map(f => f.directPerHa * f.areaHa)) / tonnes : null,
      missing: fields.filter(f => f.marginPerHa === null).map(f => f.name),
    };
  });

  // Grange: a contract farming agreement with Knowles. Farmer's charge and
  // contractor's fee come off first; what's left is shared.
  const gr = groups.find(g => g.id === 'grange')!;
  const grDirect = gr.directPerHa * gr.areaHa;
  const acres = gr.areaHa * 2.47105;
  const farmersCharge = acres * s.grange.farmersChargePerAc;
  const contractorsFee = acres * s.grange.contractorsFeePerAc;
  const grRevenue = gr.missing.length ? null : gr.revenue;
  const surplus = grRevenue === null ? null : grRevenue - grDirect - farmersCharge - contractorsFee;
  const ourShare = surplus === null ? null : (surplus * s.grange.sharePct) / 100;
  const managementFee = s.grange.managementFee || 0;
  const ourIncome = ourShare === null ? null : contractorsFee + ourShare + managementFee;

  const own = groups.filter(g => g.id !== 'grange');
  const ownMargin = sum(own.map(g => g.margin));
  const ownComplete = own.every(g => !g.missing.length);
  const oh = s.overheads;
  const overheads = (oh.rent || 0) + (oh.labour || 0) + (oh.machinery || 0) + (oh.fuel || 0) + (oh.other || 0);
  const schemeIncome = oh.schemeIncome || 0;

  const chemPrices: ChemPriceLine[] = Array.from(chemUse.entries())
    .map(([name, u]) => {
      const p = priceFor(name);
      return { name, price: p.price, unit: recUnitFor(name, jobs) || p.unit, source: p.source, usedQty: u.qty, cost: u.cost, hint: LATER_PRICE_HINTS[name] };
    })
    .sort((a, b) => (a.price === null ? 0 : 1) - (b.price === null ? 0 : 1) || b.cost - a.cost || a.name.localeCompare(b.name));

  return {
    harvest, fields: fieldRows, groups, chemPrices, extras, extrasUnassigned,
    grange: { areaHa: gr.areaHa, acres, revenue: grRevenue, direct: grDirect, farmersCharge, contractorsFee, surplus, ourShare, managementFee, ourIncome },
    whole: {
      ownAreaHa: sum(own.map(g => g.areaHa)), ownMargin, ownComplete, grangeIncome: ourIncome, overheads, schemeIncome,
      net: ownMargin + (ourIncome || 0) - overheads + schemeIncome,
    },
    notes, info,
  };
}

/** Grange wheat is sold like the milling wheat unless James types its own price. */
export function priceForGroup(s: CropMarginSettings, g: MarginGroup): { price: number | null; source: string } {
  const own = s.prices[g];
  if (isNum(own)) return { price: own, source: '' };
  if (g === 'grange' && isNum(s.prices.milling)) return { price: s.prices.milling, source: 'same as milling wheat' };
  return { price: null, source: '' };
}

function recUnitFor(name: string, jobs: { job: AgronomyJob }[]): 'L' | 'kg' | undefined {
  for (const { job } of jobs) for (const p of job.products) if (p.name === name) return recUnit(p.unit).unit;
  return undefined;
}
