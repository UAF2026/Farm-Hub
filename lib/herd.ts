// Herd records: the full Farmplan Cattle Manager history plus James's edits.
//
// The Farmplan import (every animal since the 1990s, calvings, treatments,
// weights, sales) is stored once in the Supabase table herd_records (row id
// 'farmplan') and never changed. James's corrections, new calves, bulling
// groups and sales go in data.herdEdits in the main blob and are laid over the
// import here. Wagyu % and inbreeding are worked out from the pedigree each
// time, so a corrected sire or dam flows through to every descendant.

export interface HerdAnimal {
  id: number;
  tag: string;
  name: string;
  dob: string;            // YYYY-MM-DD or ''
  sex: string;            // 'M' | 'F'
  breed: string;
  sire: number | null;
  dam: number | null;
  on: boolean;            // on the farm now
  ref: boolean;           // reference animal (AI sire etc.), never on the farm
  hb?: number;            // home-bred
  left?: string;          // date it left
  to?: string;            // where it went
  dw?: number;            // deadweight kg
  price?: number;         // £
  slaughter?: number;
  from?: string;          // bought from
  arrived?: string;
  bought?: number;
  wbase?: number | null;  // Wagyu % fixed by rule (founders, pre-2013, Warrendale stores…)
  wnote?: string;
  wpct?: number | null;   // James's own Wagyu % override
  bull?: boolean;         // James says this is (true) / isn't (false) a breeding bull
  notes?: string;
  added?: boolean;        // added in the Hub, not from Farmplan
}

export interface HerdCalvingRow { dam: number; sire: number | null; served: string; calved: string; calves: number[] }
export interface HerdTreatment { a: number; d: string; p: string; r: string; q: number; wd: string }
export interface HerdWeight { a: number; d: string; w: number }

export interface HerdBase {
  source: string;
  imported: string;
  animals: HerdAnimal[];
  calvings: HerdCalvingRow[];
  treatments: HerdTreatment[];
  weights: HerdWeight[];
}

export interface HerdEdits {
  animals?: Record<string, Partial<HerdAnimal>>;   // keyed by animal id
  added?: HerdAnimal[];                             // new animals (ids from 900000 up)
  bulling?: Record<string, Record<string, number>>; // season year → cow id → bull id
  weights?: HerdWeight[];
  updated?: string;
}

export interface Herd {
  base: HerdBase;
  animals: HerdAnimal[];
  byId: Map<number, HerdAnimal>;
  children: Map<number, HerdAnimal[]>;  // by dam or sire id
  served: Map<number, string>;          // calf id → service date
  treatments: Map<number, HerdTreatment[]>;
  weights: Map<number, HerdWeight[]>;
  wagyu: (id: number | null | undefined) => number | null;
  wagyuHow: (id: number) => string;
  kinship: (a: number | null, b: number | null) => number;
  inbreeding: (id: number) => number;
}

export const ADDED_ID_START = 900000;

export function buildHerd(base: HerdBase, edits: HerdEdits | undefined): Herd {
  const e = edits || {};
  const animals: HerdAnimal[] = base.animals.map(a => {
    const ed = e.animals?.[String(a.id)];
    return ed ? { ...a, ...ed, id: a.id } : a;
  });
  for (const a of e.added || []) {
    const ed = e.animals?.[String(a.id)];
    animals.push(ed ? { ...a, ...ed, id: a.id, added: true } : { ...a, added: true });
  }
  const byId = new Map(animals.map(a => [a.id, a]));
  const children = new Map<number, HerdAnimal[]>();
  for (const a of animals) {
    for (const p of [a.dam, a.sire]) {
      if (p == null) continue;
      if (!children.has(p)) children.set(p, []);
      children.get(p)!.push(a);
    }
  }
  const served = new Map<number, string>();
  for (const c of base.calvings) for (const k of c.calves) if (c.served) served.set(k, c.served);

  const treatments = new Map<number, HerdTreatment[]>();
  for (const t of base.treatments) {
    if (!treatments.has(t.a)) treatments.set(t.a, []);
    treatments.get(t.a)!.push(t);
  }
  const weights = new Map<number, HerdWeight[]>();
  for (const w of [...base.weights, ...(e.weights || [])]) {
    if (!weights.has(w.a)) weights.set(w.a, []);
    weights.get(w.a)!.push(w);
  }

  // ── Wagyu % ──
  const wMemo = new Map<number, number | null>();
  const NEEDS_PARENTS = new Set(['Sire not recorded', 'Dam not recorded']);
  function wagyu(id: number | null | undefined, depth = 0): number | null {
    if (id == null) return null;
    if (wMemo.has(id)) return wMemo.get(id)!;
    const a = byId.get(id);
    let v: number | null = null;
    if (a && depth < 60) {
      const fixed = a.wbase !== undefined && !(a.wnote && NEEDS_PARENTS.has(a.wnote) && a.sire != null && a.dam != null);
      if (a.wpct != null) v = a.wpct;
      else if (fixed) v = a.wbase ?? null;
      else if (a.sire != null && a.dam != null) {
        const s = wagyu(a.sire, depth + 1), d = wagyu(a.dam, depth + 1);
        v = s == null || d == null ? null : (s + d) / 2;
      }
    }
    wMemo.set(id, v);
    return v;
  }
  function wagyuHow(id: number): string {
    const a = byId.get(id);
    if (!a) return '';
    if (a.wpct != null) return 'Set by James';
    const fixed = a.wbase !== undefined && !(a.wnote && NEEDS_PARENTS.has(a.wnote) && a.sire != null && a.dam != null);
    if (fixed) return a.wnote || 'Fixed';
    if (a.sire == null) return 'Sire not recorded';
    if (a.dam == null) return 'Dam not recorded';
    return 'Half sire + half dam';
  }

  // ── Inbreeding (coefficient of coancestry, recursive with memo) ──
  const depthMemo = new Map<number, number>();
  function gen(id: number, guard = 0): number {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    const a = byId.get(id);
    let d = 0;
    if (a && guard < 60) d = 1 + Math.max(a.sire != null ? gen(a.sire, guard + 1) : -1, a.dam != null ? gen(a.dam, guard + 1) : -1);
    depthMemo.set(id, d);
    return d;
  }
  const kMemo = new Map<string, number>();
  function kinship(a: number | null, b: number | null): number {
    if (a == null || b == null || !byId.has(a) || !byId.has(b)) return 0;
    if (a === b) return (1 + inbreeding(a)) / 2;
    const key = a < b ? a + ':' + b : b + ':' + a;
    if (kMemo.has(key)) return kMemo.get(key)!;
    // Expand the younger one (more generations behind it), so we never expand an ancestor of the other.
    let x = a, y = b;
    if (gen(b) > gen(a)) { x = b; y = a; }
    const ax = byId.get(x)!;
    const v = 0.5 * (kinship(ax.sire, y) + kinship(ax.dam, y));
    kMemo.set(key, v);
    return v;
  }
  const fMemo = new Map<number, number>();
  function inbreeding(id: number): number {
    if (fMemo.has(id)) return fMemo.get(id)!;
    fMemo.set(id, 0);
    const a = byId.get(id);
    const v = a ? kinship(a.sire, a.dam) : 0;
    fMemo.set(id, v);
    return v;
  }

  return { base, animals, byId, children, served, treatments, weights, wagyu: (id) => wagyu(id), wagyuHow, kinship, inbreeding };
}

// ── Display helpers ──

/** "UK 283762 601467" → "601467"; names win if present. */
export function shortTag(a: HerdAnimal | undefined): string {
  if (!a) return '—';
  const t = (a.tag || '').trim();
  const m = t.match(/(\d{5,7})\s*$/);
  return m ? m[1] : t || `#${a.id}`;
}
export function label(a: HerdAnimal | undefined): string {
  if (!a) return '—';
  return a.name ? `${a.name} (${shortTag(a)})` : shortTag(a);
}
export function pct(v: number | null | undefined, dp = 1): string {
  if (v == null) return '—';
  return (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)) + '%';
}
export function ageYears(dob: string, at = new Date()): number | null {
  if (!dob) return null;
  return (at.getTime() - new Date(dob + 'T12:00:00').getTime()) / (365.25 * 864e5);
}
export function ageLabel(dob: string): string {
  const y = ageYears(dob);
  if (y == null) return '';
  if (y < 2) return `${Math.max(0, Math.floor(y * 12))} mo`;
  return `${Math.floor(y)} yr`;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5);
}
/** Search match on the last digits of the tag, the full tag or the name. */
export function matches(a: HerdAnimal, q: string): boolean {
  const s = q.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return true;
  return (a.tag || '').toLowerCase().replace(/\s+/g, '').includes(s) || (a.name || '').toLowerCase().includes(s);
}

// ── Herd structure ──

export type Group = 'Cow' | 'Heifer' | 'Calf' | 'Bull' | 'Young bull / steer' | 'Other';

export function isBreedingBull(h: Herd, a: HerdAnimal, now = new Date()): boolean {
  if (a.sex !== 'M' || !a.on) return false;
  if (a.bull !== undefined) return a.bull;
  if (a.name) return true;
  // Has sired calves in the last three years.
  const cutoff = new Date(now.getTime() - 3 * 365.25 * 864e5).toISOString().slice(0, 10);
  return (h.children.get(a.id) || []).some(c => c.sire === a.id && c.dob >= cutoff);
}

export function groupOf(h: Herd, a: HerdAnimal): Group {
  const y = ageYears(a.dob);
  if (a.sex === 'M') {
    if (isBreedingBull(h, a)) return 'Bull';
    if (y != null && y < 1) return 'Calf';
    return 'Young bull / steer';
  }
  if (a.sex === 'F') {
    const calved = (h.children.get(a.id) || []).some(c => c.dam === a.id);
    if (calved) return 'Cow';
    if (y != null && y < 1) return 'Calf';
    return 'Heifer';
  }
  return 'Other';
}

export function wagyuBand(v: number | null): string {
  if (v == null) return 'Unknown';
  if (v >= 100) return '100%';
  if (v >= 93.75) return '93.75%+';
  if (v >= 87.5) return '87.5%';
  if (v >= 75) return '75%';
  if (v >= 50) return '50%';
  if (v > 0) return 'Under 50%';
  return '0% (pre-Wagyu)';
}
export const BANDS = ['100%', '93.75%+', '87.5%', '75%', '50%', 'Under 50%', '0% (pre-Wagyu)', 'Unknown'];

// ── Cow performance ──

export interface CowStats {
  cow: HerdAnimal;
  age: number | null;
  wagyu: number | null;
  calvings: { date: string; calves: HerdAnimal[]; sire: HerdAnimal | undefined }[];
  firstCalvingAgeMonths: number | null;
  lastCalved: string;
  avgInterval: number | null;   // days
  lastInterval: number | null;
  missedYears: number;          // springs with no calf between first calving and the latest season
  calvesSold: number;
  avgCalfDw: number | null;
  avgCalfPrice: number | null;
  flags: string[];
}

export function cowStats(h: Herd, cow: HerdAnimal, now = new Date()): CowStats {
  const kids = (h.children.get(cow.id) || []).filter(c => c.dam === cow.id && c.dob).sort((a, b) => a.dob.localeCompare(b.dob));
  const calvings: CowStats['calvings'] = [];
  for (const k of kids) {
    const last = calvings[calvings.length - 1];
    if (last && Math.abs(daysBetween(last.date, k.dob)) <= 3) { last.calves.push(k); continue; }
    calvings.push({ date: k.dob, calves: [k], sire: k.sire != null ? h.byId.get(k.sire) : undefined });
  }
  const intervals: number[] = [];
  for (let i = 1; i < calvings.length; i++) intervals.push(daysBetween(calvings[i - 1].date, calvings[i].date));
  const age = ageYears(cow.dob, now);
  const first = calvings[0]?.date;
  const firstCalvingAgeMonths = first && cow.dob ? Math.round(daysBetween(cow.dob, first) / 30.44) : null;
  const lastCalved = calvings[calvings.length - 1]?.date || '';
  // Seasons: spring calving, so a "year" is the calendar year of calving.
  const thisYear = now.getFullYear();
  const latestSeason = now.getMonth() >= 6 ? thisYear : thisYear - 1;   // by July this year's calving is done
  let missed = 0;
  if (first) {
    const years = new Set(calvings.map(c => Number(c.date.slice(0, 4))));
    const end = cow.on ? latestSeason : Number((cow.left || lastCalved).slice(0, 4));
    for (let y = Number(first.slice(0, 4)) + 1; y <= end; y++) if (!years.has(y)) missed++;
  }
  const sold = kids.filter(k => k.left);
  const dws = sold.map(k => k.dw).filter((v): v is number => !!v);
  const prices = sold.map(k => k.price).filter((v): v is number => !!v);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

  const flags: string[] = [];
  if (cow.on) {
    if (age != null && age >= 12) flags.push(`Age ${Math.floor(age)}`);
    if (!calvings.length && age != null && age >= 3) flags.push('Never calved');
    if (calvings.length && Number(lastCalved.slice(0, 4)) < latestSeason) flags.push(`No calf since ${lastCalved.slice(0, 4)}`);
    const li = intervals[intervals.length - 1];
    if (li && li > 425) flags.push(`Last interval ${li} days`);
    if (missed >= 2) flags.push(`${missed} missed years`);
  }
  return {
    cow, age, wagyu: h.wagyu(cow.id), calvings, firstCalvingAgeMonths, lastCalved,
    avgInterval: intervals.length ? Math.round(avg(intervals)!) : null,
    lastInterval: intervals.length ? intervals[intervals.length - 1] : null,
    missedYears: missed, calvesSold: sold.length,
    avgCalfDw: avg(dws), avgCalfPrice: avg(prices), flags,
  };
}

// ── Bulling ──

export function verdict(f: number): { label: string; cls: string } {
  if (f >= 0.125) return { label: 'Avoid', cls: 'bg-red' };
  if (f >= 0.0625) return { label: 'Caution', cls: 'bg-amber' };
  return { label: 'OK', cls: 'bg-green' };
}

/** Plain-words relationship between a bull and a cow, from the closest shared ancestor. */
export function relation(h: Herd, bull: number, cow: number): string {
  const anc = (id: number, max = 4) => {
    const out = new Map<number, number>();
    const walk = (x: number | null, d: number) => {
      if (x == null || d > max) return;
      if (!out.has(x) || out.get(x)! > d) out.set(x, d);
      const a = h.byId.get(x);
      if (a) { walk(a.sire, d + 1); walk(a.dam, d + 1); }
    };
    walk(id, 0);
    return out;
  };
  const ab = anc(bull), ac = anc(cow);
  if (ac.has(bull)) {
    const d = ac.get(bull)!;
    return d === 1 ? 'He is her sire' : d === 2 ? 'He is her grandsire' : `He is her ancestor (${d} gens)`;
  }
  if (ab.has(cow)) return 'She is his dam/ancestor';
  const a = h.byId.get(bull), c = h.byId.get(cow);
  if (a && c) {
    const sameSire = a.sire != null && a.sire === c.sire, sameDam = a.dam != null && a.dam === c.dam;
    if (sameSire && sameDam) return 'Full brother';
    if (sameSire) return `Half brother (same sire, ${label(h.byId.get(a.sire!))})`;
    if (sameDam) return `Half brother (same dam, ${label(h.byId.get(a.dam!))})`;
  }
  let best: [number, number] | null = null;
  ac.forEach((dc, id) => {
    if (id === cow) return;
    const db = ab.get(id);
    if (db === undefined || id === bull) return;
    if (!best || dc + db < best[1]) best = [id, dc + db];
  });
  if (best) return `Shared ancestor ${label(h.byId.get((best as [number, number])[0]))}`;
  return '';
}
