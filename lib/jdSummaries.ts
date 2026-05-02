// Matches John Deere field names to Hub field names and builds a per-field
// summary of recent operations.
//
// JD has 98 named fields; the Hub has 61. Many overlap by exact name (e.g.
// "Lewknor", "Bix Manor"). Some differ by spelling/casing/punctuation
// ("behind chris`s" vs "Behind Chris's") — handled by normalised matching.
// A small number need a manual override (e.g. JD "Soundees1/2/3" should map
// to Hub "Soundess") which is stored in farmdata.jdFieldOverrides.

import type { Field, JdOperation } from './types';

export interface JdFieldSummary {
  hubFieldName: string;
  jdFieldName: string;        // the JD name we matched on
  jdFieldNames: string[];     // all JD names contributing (for override / multi-match)
  matchType: 'exact' | 'normalised' | 'override';
  totalOps: number;
  latestSeeding?: { date: string; cropName?: string; variety?: string };
  latestHarvest?: { date: string; cropName?: string; variety?: string };
  recentApplications: { date: string; products: string[] }[];
  recentTillage: { date: string; type?: string }[];
  // Best-guess current crop/variety from the most recent seeding within the last 18 months.
  currentCrop?: string;
  currentVariety?: string;
  currentSeason?: string;
}

const CROP_NAMES: Record<string, string> = {
  WHEAT_EURO_WTR: 'Winter Wheat',
  WHEAT_EURO_SPR: 'Spring Wheat',
  BARLEY_EURO_WTR: 'Winter Barley',
  BARLEY_EURO_SPR: 'Spring Barley',
  RAPESEED_WTR: 'Winter OSR',
  RAPESEED_SPR: 'Spring OSR',
  OATS_WTR: 'Winter Oats',
  OATS_SPR: 'Spring Oats',
  BEANS_WTR: 'Winter Beans',
  BEANS_SPR: 'Spring Beans',
  GRASS: 'Grass',
  MAIZE: 'Maize',
};

export function prettyCropName(code?: string): string | undefined {
  if (!code) return undefined;
  return CROP_NAMES[code] || code.replace(/_/g, ' ').toLowerCase();
}

// Normalise a field name for lenient matching:
//   "Behind Chris's"  → "behindchriss"
//   "BIX-Soundess"    → "soundess"
//   "behind chris`s"  → "behindchriss"
//   "Soundees 1"      → "soundees"   (trailing digit/letter suffix stripped)
function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^bix[-\s]+/i, '')             // strip BIX- prefix
    .replace(/[^a-z0-9]/g, '')              // letters + digits only
    .replace(/[\d]+[a-z]?$/, '');           // trailing "1", "1a", "12" suffix
}

interface MatchResult {
  jdFieldNames: string[];
  matchType: JdFieldSummary['matchType'];
}

function findJdMatchesFor(
  hubField: Field,
  jdFieldNames: string[],
  overrides: Record<string, string[]> | undefined
): MatchResult | null {
  // 1. Manual override wins (Hub field name → array of JD field names).
  const overrideList = overrides?.[hubField.name];
  if (overrideList && overrideList.length) {
    const filtered = overrideList.filter((n) => jdFieldNames.includes(n));
    if (filtered.length) return { jdFieldNames: filtered, matchType: 'override' };
  }

  // 2. Exact (case-sensitive) match.
  const exact = jdFieldNames.find((n) => n === hubField.name);
  if (exact) return { jdFieldNames: [exact], matchType: 'exact' };

  // 3. Normalised match — and gather every JD field that normalises the same
  // way, so "Soundees1", "Soundees2", "Soundees3" all roll into one Hub field.
  const hubNorm = normaliseName(hubField.name);
  if (!hubNorm) return null;
  const normalised = jdFieldNames.filter((n) => normaliseName(n) === hubNorm);
  if (normalised.length) return { jdFieldNames: normalised, matchType: 'normalised' };

  return null;
}

function buildSummaryFromOps(ops: JdOperation[]): Pick<
  JdFieldSummary,
  | 'totalOps'
  | 'latestSeeding'
  | 'latestHarvest'
  | 'recentApplications'
  | 'recentTillage'
  | 'currentCrop'
  | 'currentVariety'
  | 'currentSeason'
> {
  // ops are sorted newest first.
  const sorted = [...ops].sort((a, b) => b.startDate.localeCompare(a.startDate));

  let latestSeeding: JdFieldSummary['latestSeeding'];
  let latestHarvest: JdFieldSummary['latestHarvest'];
  const recentApplications: { date: string; products: string[] }[] = [];
  const recentTillage: { date: string; type?: string }[] = [];

  for (const op of sorted) {
    if (op.type === 'seeding' && !latestSeeding) {
      latestSeeding = {
        date: op.startDate,
        cropName: prettyCropName(op.cropName),
        variety: op.varieties?.[0],
      };
    }
    if (op.type === 'harvest' && !latestHarvest) {
      latestHarvest = {
        date: op.startDate,
        cropName: prettyCropName(op.cropName),
        variety: op.varieties?.[0],
      };
    }
    if (op.type === 'application' && recentApplications.length < 5) {
      recentApplications.push({
        date: op.startDate,
        products: (op.products || []).map((p) => p.name).filter(Boolean),
      });
    }
    if (op.type === 'tillage' && recentTillage.length < 3) {
      recentTillage.push({
        date: op.startDate,
        type: op.tillageType,
      });
    }
  }

  // Pick the most recent seeding within the last 18 months as the current crop.
  const eighteenMonthsAgo = Date.now() - 18 * 30 * 24 * 60 * 60 * 1000;
  let currentCrop: string | undefined;
  let currentVariety: string | undefined;
  let currentSeason: string | undefined;
  if (latestSeeding) {
    const t = new Date(latestSeeding.date).getTime();
    if (!Number.isNaN(t) && t >= eighteenMonthsAgo) {
      currentCrop = latestSeeding.cropName;
      currentVariety = latestSeeding.variety;
      const seedingOp = sorted.find((o) => o.type === 'seeding');
      currentSeason = seedingOp?.cropSeason;
    }
  }

  return {
    totalOps: ops.length,
    latestSeeding,
    latestHarvest,
    recentApplications,
    recentTillage,
    currentCrop,
    currentVariety,
    currentSeason,
  };
}

export interface JdMatchResult {
  summariesByHubName: Record<string, JdFieldSummary>;
  unmatchedHubFields: string[];   // Hub field names with no JD match
  unmatchedJdFields: string[];    // JD field names not assigned to any Hub field
}

export function buildJdSummaries(
  hubFields: Field[],
  jdOps: JdOperation[],
  overrides?: Record<string, string[]>
): JdMatchResult {
  // Group operations by JD field name.
  const opsByJdName: Record<string, JdOperation[]> = {};
  for (const op of jdOps) {
    if (!op.fieldName) continue;
    if (!opsByJdName[op.fieldName]) opsByJdName[op.fieldName] = [];
    opsByJdName[op.fieldName].push(op);
  }
  const jdFieldNames = Object.keys(opsByJdName);

  const summariesByHubName: Record<string, JdFieldSummary> = {};
  const unmatchedHubFields: string[] = [];
  const claimedJdNames = new Set<string>();

  for (const hf of hubFields) {
    const match = findJdMatchesFor(hf, jdFieldNames, overrides);
    if (!match) {
      unmatchedHubFields.push(hf.name);
      continue;
    }
    const aggregated: JdOperation[] = [];
    for (const jdName of match.jdFieldNames) {
      claimedJdNames.add(jdName);
      aggregated.push(...(opsByJdName[jdName] || []));
    }
    if (!aggregated.length) continue;
    summariesByHubName[hf.name] = {
      hubFieldName: hf.name,
      jdFieldName: match.jdFieldNames[0],
      jdFieldNames: match.jdFieldNames,
      matchType: match.matchType,
      ...buildSummaryFromOps(aggregated),
    };
  }

  const unmatchedJdFields = jdFieldNames.filter((n) => !claimedJdNames.has(n));

  return { summariesByHubName, unmatchedHubFields, unmatchedJdFields };
}
