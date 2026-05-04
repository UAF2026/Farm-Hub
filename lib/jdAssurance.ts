// Converts John Deere application operations into Hub Spray and Fertiliser
// records, ready for Farm Assurance / Red Tractor / SAI Global reporting.
//
// Field-name matching uses the same matcher as the Crops page so both views
// stay in sync. Records carry a `source: 'jd'` flag and `jdOpId` so re-runs
// don't create duplicates.

import type { Field, FertiliserRecord, JdOperation, SprayRecord } from './types';
import { buildJdSummaries } from './jdSummaries';

// Heuristic: a product is fertiliser-class if it's tagged FERTILIZER by Deere
// OR its name contains a fertiliser keyword. Catches the cases where Deere's
// auto-tagging missed (e.g. "Sulphur 26%N 35%SO3" sometimes comes back blank).
const FERT_KEYWORDS = [
  'fertili',  // fertiliser / fertilizer
  'manure',
  'slurry',
  'nitrogen',
  'sulphur',
  'sulfur',
  'ammonium',
  'urea',
  'compound',
  'npk',
  'kainit',
  'mop',
  'dap',
  'tsp',
  'lime',
];

function isFertiliserProductName(name: string): boolean {
  const lower = name.toLowerCase();
  return FERT_KEYWORDS.some((k) => lower.includes(k));
}

function isFertiliserProduct(p: { name: string; type?: string }): boolean {
  if (p.type === 'FERTILIZER') return true;
  return isFertiliserProductName(p.name);
}

// Sniff the percentage of N from product name like "Nitrogen 33.5%" → 33.5.
function sniffN(name: string): number {
  const m = name.match(/(\d+(?:\.\d+)?)\s*%\s*N\b/i) || name.match(/^Nitrogen\s+(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}

// Sniff S/SO3% similarly.
function sniffS(name: string): number {
  const m = name.match(/(\d+(?:\.\d+)?)\s*%\s*(?:SO3|S)\b/i);
  return m ? parseFloat(m[1]) : 0;
}

function classifyFertType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('manure') || lower.includes('slurry')) return 'Organic';
  if (lower.includes('liquid')) return 'Liquid N';
  if (lower.includes('nitrogen') || lower.includes('ammonium nitrate')) return 'Ammonium nitrate';
  if (lower.includes('sulphur') || lower.includes('so3')) return 'N+S';
  if (lower.includes('urea')) return 'Urea';
  if (lower.includes('compound') || lower.includes('npk')) return 'Compound NPK';
  return '';
}

let counter = 0;
function newId(): string {
  counter += 1;
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + counter.toString(36);
}

interface BuildArgs {
  jdOps: JdOperation[];
  hubFields: Field[];
  existingSprays: SprayRecord[];
  existingFertilisers: FertiliserRecord[];
  jdFieldOverrides?: Record<string, string[]>;
}

export interface AssuranceImportPlan {
  newSprays: SprayRecord[];
  newFertilisers: FertiliserRecord[];
  skipped: {
    duplicate: number;        // already imported (matched by jdOpId)
    unmatchedField: number;   // JD field name didn't map to any Hub field
    nonApplication: number;   // op type isn't 'application'
    noProducts: number;       // application had no products listed
  };
  unmatchedJdFields: string[];
}

export function buildAssuranceImport(args: BuildArgs): AssuranceImportPlan {
  const { jdOps, hubFields, existingSprays, existingFertilisers, jdFieldOverrides } = args;

  // Build JD-name → Hub-name lookup using the matcher.
  const matchResult = buildJdSummaries(hubFields, jdOps, jdFieldOverrides);
  const jdNameToHubName: Record<string, string> = {};
  for (const summary of Object.values(matchResult.summariesByHubName)) {
    for (const jdName of summary.jdFieldNames) {
      jdNameToHubName[jdName] = summary.hubFieldName;
    }
  }

  // Existing JD op IDs already imported, so we don't double-up.
  const importedOpIds = new Set<string>();
  for (const r of existingSprays) if (r.jdOpId) importedOpIds.add(r.jdOpId);
  for (const r of existingFertilisers) if (r.jdOpId) importedOpIds.add(r.jdOpId);

  const newSprays: SprayRecord[] = [];
  const newFertilisers: FertiliserRecord[] = [];
  const skipped = { duplicate: 0, unmatchedField: 0, nonApplication: 0, noProducts: 0 };
  const unmatchedJdFields = new Set<string>();

  for (const op of jdOps) {
    if (op.type !== 'application') {
      skipped.nonApplication++;
      continue;
    }
    if (importedOpIds.has(op.id)) {
      skipped.duplicate++;
      continue;
    }
    if (!op.products || op.products.length === 0) {
      skipped.noProducts++;
      continue;
    }
    const hubFieldName = jdNameToHubName[op.fieldName];
    if (!hubFieldName) {
      unmatchedJdFields.add(op.fieldName);
      skipped.unmatchedField++;
      continue;
    }
    const dateOnly = op.startDate.slice(0, 10);

    // Split products into fert vs spray and emit one record per side
    // (one application can be a tank-mix of multiple products — we capture
    // them as a single record with a combined product name to keep it simple
    // and matchable in compliance reports).
    const fertProducts = op.products.filter(isFertiliserProduct);
    const sprayProducts = op.products.filter((p) => !isFertiliserProduct(p));

    if (fertProducts.length > 0) {
      const productName = fertProducts.map((p) => p.name).join(' + ');
      const totalN = fertProducts.reduce((acc, p) => acc + sniffN(p.name), 0);
      const totalS = fertProducts.reduce((acc, p) => acc + sniffS(p.name), 0);
      newFertilisers.push({
        id: newId(),
        date: dateOnly,
        field: hubFieldName,
        crop: '',
        product: productName,
        type: classifyFertType(productName),
        n: totalN,
        p: 0,
        k: 0,
        s: totalS,
        ratePerHa: 0,
        area: 0,
        totalApplied: 0,
        operator: '',
        method: 'Spreader',
        soilTest: '',
        notes: `Imported from John Deere — JD field "${op.fieldName}". Rate/area to be confirmed.`,
        source: 'jd',
        jdOpId: op.id,
      });
    }

    if (sprayProducts.length > 0) {
      const productName = sprayProducts.map((p) => p.name).join(' + ');
      newSprays.push({
        id: newId(),
        date: dateOnly,
        field: hubFieldName,
        crop: '',
        product: productName,
        batch: '',
        dose: 0,
        doseUnit: 'l/ha',
        area: 0,
        totalProduct: 0,
        waterVolume: 0,
        operator: '',
        basisCertRef: '',
        windSpeed: '',
        temperature: '',
        harvestInterval: 0,
        reEntryInterval: 0,
        purpose: '',
        notes: `Imported from John Deere — JD field "${op.fieldName}". Rate/area/conditions to be confirmed.`,
        source: 'jd',
        jdOpId: op.id,
      });
    }
  }

  return {
    newSprays,
    newFertilisers,
    skipped,
    unmatchedJdFields: Array.from(unmatchedJdFields).sort(),
  };
}
