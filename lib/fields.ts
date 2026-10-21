// Helpers for the master field list (data.fieldRegister).
// Everything that needs to find "the same field" across Gatekeeper, the
// cropping plans, John Deere and the yields table should go through here.

import type { FarmData, MasterField, JdOperation } from './types';
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
