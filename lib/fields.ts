// Helpers for the master field list (data.fieldRegister).
// Everything that needs to find "the same field" across Gatekeeper, the
// cropping plans, John Deere and the yields table should go through here.

import type { FarmData, MasterField, JdOperation, Field } from './types';
import { GK_ROTATION_HISTORY } from './gatekeeperData';
import { prettyCropName } from './jdSummaries';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** '2026' → '25/26' (the farming year that ends with that harvest). */
export function seasonForHarvest(year: number | string): string {
  const y = Number(year);
  return `${String(y - 1).slice(2)}/${String(y).slice(2)}`;
}

/** '25/26' → 2026 */
export function harvestForSeason(season: string): number {
  return 2000 + Number(season.split('/')[1]);
}

/** The harvest year that's next to come off (Sep onwards counts towards next year's harvest). */
export function currentHarvestYear(today = new Date()): number {
  return today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear();
}

export function jdOpsForField(field: MasterField, ops: JdOperation[] = []): JdOperation[] {
  const names = new Set(field.jdNames.map(norm));
  if (!names.size) return [];
  return ops.filter(o => o.fieldName && names.has(norm(o.fieldName)));
}

/** John Deere field names that aren't linked to any field in the list. */
export function unlinkedJdNames(register: MasterField[], ops: JdOperation[] = [], ignored: string[] = []): string[] {
  const linked = new Set(register.flatMap(f => f.jdNames.map(norm)));
  const skip = new Set(ignored.map(norm));
  const names = new Set<string>();
  for (const o of ops) if (o.fieldName && !linked.has(norm(o.fieldName)) && !skip.has(norm(o.fieldName))) names.add(o.fieldName);
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export interface SeasonLine {
  harvest: number;
  season: string;
  crop: string;
  variety?: string;
  source: 'cropping plan' | 'Gatekeeper';
  targetYield?: number;
  drilled?: string;      // earliest John Deere drilling of a cereal/bean/oilseed crop that season (YYYY-MM-DD)
  events: FieldEvent[];  // every John Deere drilling and harvest job that season, oldest first
}

export interface FieldEvent {
  date: string;          // YYYY-MM-DD
  kind: 'drilled' | 'harvested';
  crop?: string;
  variety?: string;
}

const MAIN_CROP = /WHEAT|BARLEY|BEAN|OAT|RAPE|CANOLA|PEA|RYE|TRITICALE|LINSEED/;

/**
 * One line per harvest year for a field: what was grown (cropping plan where
 * there is one, else the Gatekeeper rotation export) plus drilling and
 * harvest dates from John Deere.
 */
export function cropHistory(field: MasterField, db: FarmData): SeasonLine[] {
  const lines = new Map<number, SeasonLine>();
  const gkNames = new Set((field.gkNames || []).map(norm));
  const gkCodes = new Set(field.gkCodes);

  for (const name of Object.keys(GK_ROTATION_HISTORY)) {
    if (!gkNames.has(norm(name))) continue;
    for (const [year, crop] of Object.entries(GK_ROTATION_HISTORY[name])) {
      const h = Number(year);
      const prev = lines.get(h);
      // Fields made of two Gatekeeper fields (e.g. Wanscombe) show both if they differ.
      const c = prev && prev.crop !== crop ? `${prev.crop} / ${crop}` : crop;
      lines.set(h, { harvest: h, season: seasonForHarvest(h), crop: c, source: 'Gatekeeper', events: [] });
    }
  }

  for (const sp of db.croppingPlans || []) {
    const plan = sp.plans.find(p => gkCodes.has(p.fieldParcel) || norm(p.fieldName) === norm(field.name) || gkNames.has(norm(p.fieldName)));
    if (!plan || !plan.plannedCrop) continue;
    const h = harvestForSeason(sp.season);
    lines.set(h, {
      harvest: h, season: sp.season, crop: plan.plannedCrop === 'Other' && plan.variety ? plan.variety : plan.plannedCrop,
      variety: plan.plannedCrop === 'Other' ? undefined : plan.variety || undefined,
      source: 'cropping plan', targetYield: plan.targetYieldTha || undefined, events: lines.get(h)?.events || [],
    });
  }

  // John Deere jobs: a drilling from Aug onwards counts towards the next harvest.
  for (const o of jdOpsForField(field, db.jdOperations)) {
    if (o.type !== 'seeding' && o.type !== 'harvest') continue;
    const d = o.startDate.slice(0, 10);
    const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
    const h = o.type === 'seeding' && m >= 8 ? y + 1 : y;
    const crop = o.cropName && o.cropName !== 'UNSPECIFIED_CROP' ? prettyCropName(o.cropName) : undefined;
    const line = lines.get(h) || { harvest: h, season: seasonForHarvest(h), crop: crop || '', source: 'Gatekeeper' as const, events: [] };
    line.events.push({ date: d, kind: o.type === 'seeding' ? 'drilled' : 'harvested', crop, variety: o.varieties?.filter(Boolean).join(', ') || undefined });
    if (o.type === 'seeding' && MAIN_CROP.test(o.cropName || '') && (!line.drilled || d < line.drilled)) line.drilled = d;
    lines.set(h, line);
  }
  lines.forEach(l => l.events.sort((a, b) => a.date.localeCompare(b.date)));

  return Array.from(lines.values()).sort((a, b) => b.harvest - a.harvest);
}

export const LAND_BLOCKS = [
  'Home farm (Stonor)', 'Owned', 'Bix Hall', 'Hollandridge', 'Grange & Shenley (Knowles)',
  'Bellhatch', 'Bix Manor', 'Valley Farm Bix',
];

/* ─── Lookups used by the other tabs ─────────────────────────────────────── */

/** Every name a field goes by (its own, Gatekeeper, John Deere, agreements), normalised. */
export function fieldNameKeys(f: MasterField): string[] {
  return [f.name, ...(f.gkNames || []), ...f.jdNames, ...(f.otherNames || []), ...f.rpaParcels].map(norm).filter(Boolean);
}

/** Looser key for a second-pass match: 'The Bank' = 'Bank', 'Barn Field' = 'Barn', 'Spring pit' = 'Spring Pit'. */
const loose = (s: string) => norm(s).replace(/^the/, '').replace(/field$/, '');

/** Find the field a free-text name refers to (old field-list names, spray records, soil tests…). */
export function findFieldByName(register: MasterField[], name?: string): MasterField | undefined {
  if (!name) return undefined;
  const k = norm(name);
  const exact = register.find(f => norm(f.name) === k) || register.find(f => fieldNameKeys(f).includes(k));
  if (exact) return exact;
  const l = loose(name);
  const hits = l.length >= 3 ? register.filter(f => fieldNameKeys(f).some(key => loose(key) === l)) : [];
  return hits.length === 1 ? hits[0] : undefined;   // only when it's unambiguous
}

/** The field that owns an RPA parcel, given the map's sheet and parcel ids (e.g. 'SU7288', '5509'). */
export function findFieldByParcel(register: MasterField[], sheetId: string, parcelId: string): MasterField | undefined {
  const ref = `${sheetId} ${parcelId}`.replace(/\s+/g, ' ').trim().toUpperCase();
  return register.find(f => f.rpaParcels.some(p => p.replace(/\s+/g, ' ').trim().toUpperCase() === ref));
}

/** Records (sprays, fertilisers, soil tests…) whose `field` text belongs to this field. */
export function recordsForField<T extends { field?: string }>(f: MasterField, records: T[] = []): T[] {
  const keys = new Set(fieldNameKeys(f));
  const looseKeys = new Set(fieldNameKeys(f).map(loose).filter(k => k.length >= 3));
  return records.filter(r => r.field && (keys.has(norm(r.field)) || looseKeys.has(loose(r.field))));
}

/** What's in the ground for the harvest coming up (from the cropping plan, else Gatekeeper). */
export function currentCrop(f: MasterField, db: FarmData): { crop: string; variety?: string } | null {
  const h = currentHarvestYear();
  const line = cropHistory(f, db).find(l => l.harvest === h);
  if (line?.crop) return { crop: line.crop, variety: line.variety };
  if (f.use === 'grass') return { crop: 'Grass' };
  return null;
}

/** Active fields in a stable order. */
export function activeFields(db: FarmData): MasterField[] {
  return (db.fieldRegister || []).filter(f => f.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
}

/** Rough colour for a crop name, shared by the map and lists. */
export function cropColour(crop?: string): string {
  const c = (crop || '').toLowerCase();
  if (!c) return '#9db4c4';
  if (c.includes('wheat') || c.includes('skyfall') || c.includes('extase') || c.includes('ultimatum') || c.includes('gromwell') || c.includes('gromswell') || c.includes('diamond')) return '#e2c234';
  if (c.includes('barley')) return '#d4900a';
  if (c.includes('bean') || c.includes('pea')) return '#9a6fb0';
  if (c.includes('ahiflower') || c.includes('chia')) return '#d96c9a';
  if (c.includes('oat')) return '#c8b060';
  if (c.includes('rape') || c.includes('osr')) return '#b8d820';
  if (c.includes('ley') || c.includes('temp')) return '#7cc47c';
  if (c.includes('grass') || c.includes('pasture')) return '#3a8c3a';
  if (c.includes('cover') || c.includes('fallow') || c.includes('ab15')) return '#30a0a0';
  return '#78a8c8';
}

/**
 * Inputs for the John Deere matcher (buildJdSummaries / buildAssuranceImport).
 * With a master field list, each field is matched only to the John Deere names
 * linked to it (compared ignoring case and spaces), so jobs never land on a
 * field by guesswork and unlinked names (e.g. contract work) are skipped.
 * Without one, falls back to the old field list and fuzzy name matching.
 */
export function jdMatchInputs(db: FarmData): { hubFields: Field[]; jdFieldOverrides?: Record<string, string[]> } {
  const reg = db.fieldRegister;
  if (!reg?.length) return { hubFields: db.fields || [] };
  const opNames = Array.from(new Set((db.jdOperations || []).map(o => o.fieldName).filter(Boolean)));
  const hubFields: Field[] = [];
  const jdFieldOverrides: Record<string, string[]> = {};
  for (const f of reg) {
    const keys = new Set(f.jdNames.map(norm));
    const names = opNames.filter(n => keys.has(norm(n)));
    if (!names.length) continue;
    hubFields.push({ name: f.name, area: f.areaHa, status: f.use === 'arable' ? 'In crop' : 'Grass', crop: '', notes: '' });
    jdFieldOverrides[f.name] = names;
  }
  return { hubFields, jdFieldOverrides };
}
