'use client';

import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { FarmData, PurchaseOrder, PurchaseProduct, AgronomyVisit, AgronomyJob, FieldCropPlan } from '@/lib/types';

type CostTab = 'prices' | 'budgets' | 'fields';

// ── UAF Benchmark variable costs (£/ha) — used when real data not yet imported ─
// Based on typical Oxfordshire chalk/mixed farm; replaced by actuals as data loaded
const BENCH_VC: Record<string, { seed: number; fert: number; spray: number; contract: number; label: string }> = {
  'Winter wheat':  { seed: 58,  fert: 185, spray: 170, contract: 90, label: 'Winter wheat' },
  'Spring wheat':  { seed: 55,  fert: 130, spray: 110, contract: 80, label: 'Spring wheat'  },
  'Winter barley': { seed: 50,  fert: 150, spray: 120, contract: 85, label: 'Winter barley' },
  'Spring barley': { seed: 45,  fert: 110, spray: 90,  contract: 80, label: 'Spring barley' },
  'OSR':           { seed: 45,  fert: 200, spray: 210, contract: 95, label: 'OSR' },
  'Legume fallow': { seed: 35,  fert: 0,   spray: 0,   contract: 30, label: 'Legume fallow' },
  'Cover crop':    { seed: 40,  fert: 0,   spray: 0,   contract: 25, label: 'Cover crop' },
};

// Wildfarmed typically saves ~£120/ha on inputs vs standard wheat (lower N, no growth regulators)
const WILDFARMED_INPUT_SAVING = 120; // £/ha vs standard wheat VC

const TH: CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  fontWeight: 600,
  fontSize: 11,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg)',
};

const TD: CSSProperties = { padding: '7px 10px', verticalAlign: 'middle', fontSize: 13 };

const THR: CSSProperties = { ...TH, textAlign: 'right' };
const TDR: CSSProperties = { ...TD, textAlign: 'right' };

function fmt(n: number, dp = 0) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtGBP(n: number, dp = 0) {
  return '£' + fmt(n, dp);
}

// Derive a unit price per kg or per litre from purchase orders
function buildPriceMap(purchases: PurchaseOrder[]): Map<string, { pricePerKg?: number; pricePerL?: number; pricePerT?: number; unit: string; rawPrice: number }> {
  const map = new Map<string, { pricePerKg?: number; pricePerL?: number; pricePerT?: number; unit: string; rawPrice: number }>();
  for (const order of purchases) {
    if (order.cancelled) continue;
    for (const p of order.products) {
      const name = p.name.toLowerCase().trim();
      const pu = (p.priceUnit || '').toLowerCase();
      const entry: { pricePerKg?: number; pricePerL?: number; pricePerT?: number; unit: string; rawPrice: number } = {
        unit: p.priceUnit,
        rawPrice: p.pricePerUnit,
      };
      if (pu.includes('tonne') || pu.includes('/t')) {
        entry.pricePerT = p.pricePerUnit;
        entry.pricePerKg = p.pricePerUnit / 1000;
      } else if (pu.includes('litre') || pu.includes('/l')) {
        entry.pricePerL = p.pricePerUnit;
      } else if (pu.includes('kg')) {
        entry.pricePerKg = p.pricePerUnit;
        entry.pricePerT = p.pricePerUnit * 1000;
      }
      map.set(name, entry);
    }
  }
  return map;
}

// Estimate spray cost/ha from agronomy visits for a given crop season
function buildAgronomySprayCost(
  visits: AgronomyVisit[],
  priceMap: Map<string, { pricePerKg?: number; pricePerL?: number; rawPrice: number; unit: string }>,
): { totalCostPerHa: number; breakdown: { product: string; ratePerHa: number; unit: string; costPerHa: number }[] } {
  const breakdown: { product: string; ratePerHa: number; unit: string; costPerHa: number }[] = [];
  const seen = new Set<string>();

  for (const visit of visits) {
    for (const job of visit.jobs) {
      for (const prod of job.products) {
        const key = prod.name.toLowerCase().trim();
        if (seen.has(key)) continue; // deduplicate by product name
        seen.add(key);

        const entry = priceMap.get(key);
        let costPerHa = 0;
        if (entry) {
          if (entry.pricePerL && prod.unit.toUpperCase() === 'L') {
            costPerHa = prod.ratePerHa * entry.pricePerL;
          } else if (entry.pricePerKg && (prod.unit.toUpperCase() === 'KG' || prod.unit.toUpperCase() === 'G')) {
            const rateKg = prod.unit.toUpperCase() === 'G' ? prod.ratePerHa / 1000 : prod.ratePerHa;
            costPerHa = rateKg * entry.pricePerKg;
          }
        }
        breakdown.push({ product: prod.name, ratePerHa: prod.ratePerHa, unit: prod.unit, costPerHa });
      }
    }
  }
  const totalCostPerHa = breakdown.reduce((s, b) => s + b.costPerHa, 0);
  return { totalCostPerHa, breakdown };
}

// Fertiliser cost/ha from JD operations
function buildFertCostFromJD(
  jdOps: FarmData['jdOperations'],
  priceMap: Map<string, { pricePerKg?: number; pricePerT?: number; rawPrice: number; unit: string }>,
): number {
  if (!jdOps || jdOps.length === 0) return 0;
  const fertOps = jdOps.filter(op => op.type === 'application' && op.products?.some(p => p.type === 'FERTILIZER'));
  if (fertOps.length === 0) return 0;

  // Get average rate/ha across all fert ops
  let totalKgHa = 0; let count = 0;
  for (const op of fertOps) {
    const m = op.measurements;
    if (m?.ratePerHa && m.rateUnit?.toLowerCase().includes('kg')) {
      totalKgHa += m.ratePerHa; count++;
    }
  }
  const avgKgHa = count > 0 ? totalKgHa / count : 0;

  // Find YaraBela / main fert price
  let fertPricePerKg = 0;
  const priceEntries = Array.from(priceMap.entries());
  for (const [name, entry] of priceEntries) {
    if (name.includes('yara') || name.includes('bela') || name.includes('nitram') || name.includes('urea')) {
      fertPricePerKg = entry.pricePerKg ?? (entry.pricePerT ? entry.pricePerT / 1000 : 0);
      break;
    }
  }
  return fertPricePerKg > 0 && avgKgHa > 0 ? avgKgHa * fertPricePerKg : 0;
}

interface BudgetRow {
  fieldParcel: string;
  fieldName: string;
  areaHa: number;
  crop: string;
  variety: string;
  contractType: string;
  yieldTha: number;
  pricePerT: number;
  grossOutputHa: number;
  grossOutput: number;
  vcSeed: number;
  vcFert: number;
  vcSpray: number;
  vcContract: number;
  vcTotal: number;
  grossMarginHa: number;
  grossMargin: number;
  dataSource: 'actual' | 'benchmark';
}

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
}

export default function Costings({ db, persist }: Props) {
  const [tab, setTab] = useState<CostTab>('budgets');
  const [season, setSeason] = useState('25/26');

  const purchases = db.purchases ?? [];
  const agronomyVisits = db.agronomyVisits ?? [];
  const jdOps = db.jdOperations ?? [];
  const croppingPlans = db.croppingPlans ?? [];

  // ── Derived data ──────────────────────────────────────────────────────────
  const priceMap = useMemo(() => buildPriceMap(purchases), [purchases]);

  const agronomySpray = useMemo(
    () => buildAgronomySprayCost(agronomyVisits, priceMap as any),
    [agronomyVisits, priceMap],
  );

  const jdFertCostHa = useMemo(
    () => buildFertCostFromJD(jdOps, priceMap as any),
    [jdOps, priceMap],
  );

  const seasonPlan = useMemo(
    () => croppingPlans.find(p => p.season === season),
    [croppingPlans, season],
  );

  // Build budget rows per field
  const budgetRows = useMemo((): BudgetRow[] => {
    if (!seasonPlan) return [];
    return seasonPlan.plans
      .filter(p => p.plannedCrop && p.plannedCrop !== 'Grass' && p.plannedCrop !== 'Herbal ley' && p.plannedCrop !== 'Cover crop' && p.plannedCrop !== 'Legume fallow')
      .map(p => {
        const crop = p.plannedCrop || 'Other';
        const isWildfarmed = p.contractType === 'Wildfarmed';
        const bench = BENCH_VC[crop] ?? BENCH_VC['Winter wheat'];

        // Spray cost: use agronomy data if available, else benchmark
        const hasSprayData = agronomySpray.totalCostPerHa > 0;
        const vcSpray = hasSprayData ? agronomySpray.totalCostPerHa : bench.spray;

        // Fert cost: use JD data if available, else benchmark
        // Wildfarmed gets a reduction
        const hasFertData = jdFertCostHa > 0;
        const vcFertBase = hasFertData ? jdFertCostHa : bench.fert;
        const vcFert = isWildfarmed ? vcFertBase * 0.45 : vcFertBase; // Wildfarmed uses ~45% of conventional N

        const vcSeed = bench.seed;
        const vcContract = bench.contract;
        const vcTotal = vcSeed + vcFert + (isWildfarmed ? vcSpray * 0.75 : vcSpray) + vcContract;

        const yieldTha = p.targetYieldTha ?? 0;
        const pricePerT = p.estimatedPricePerT ?? 0;
        const grossOutputHa = yieldTha * pricePerT;
        const grossOutput = grossOutputHa * p.areaHa;
        const grossMarginHa = grossOutputHa - vcTotal;
        const grossMargin = grossMarginHa * p.areaHa;

        return {
          fieldParcel: p.fieldParcel,
          fieldName: p.fieldName,
          areaHa: p.areaHa,
          crop,
          variety: p.variety ?? '',
          contractType: p.contractType ?? 'N/A',
          yieldTha,
          pricePerT,
          grossOutputHa,
          grossOutput,
          vcSeed,
          vcFert,
          vcSpray: isWildfarmed ? vcSpray * 0.75 : vcSpray,
          vcContract,
          vcTotal,
          grossMarginHa,
          grossMargin,
          dataSource: (hasSprayData || hasFertData) ? 'actual' : 'benchmark',
        };
      });
  }, [seasonPlan, agronomySpray, jdFertCostHa]);

  // Summary totals
  const totals = useMemo(() => {
    const totalArea = budgetRows.reduce((s, r) => s + r.areaHa, 0);
    const totalOutput = budgetRows.reduce((s, r) => s + r.grossOutput, 0);
    const totalVC = budgetRows.reduce((s, r) => s + (r.vcTotal * r.areaHa), 0);
    const totalGM = budgetRows.reduce((s, r) => s + r.grossMargin, 0);
    const avgGMHa = totalArea > 0 ? totalGM / totalArea : 0;
    return { totalArea, totalOutput, totalVC, totalGM, avgGMHa };
  }, [budgetRows]);

  // Wildfarmed vs Standard comparison
  const wfComparison = useMemo(() => {
    const wf = budgetRows.filter(r => r.contractType === 'Wildfarmed');
    const std = budgetRows.filter(r => r.contractType !== 'Wildfarmed' && (r.crop === 'Winter wheat' || r.crop === 'Spring wheat'));

    const wfArea = wf.reduce((s, r) => s + r.areaHa, 0);
    const stdArea = std.reduce((s, r) => s + r.areaHa, 0);

    const wfGMHa = wfArea > 0 ? wf.reduce((s, r) => s + r.grossMargin, 0) / wfArea : 0;
    const stdGMHa = stdArea > 0 ? std.reduce((s, r) => s + r.grossMargin, 0) / stdArea : 0;

    const wfVCHa = wfArea > 0 ? wf.reduce((s, r) => s + r.vcTotal * r.areaHa, 0) / wfArea : 0;
    const stdVCHa = stdArea > 0 ? std.reduce((s, r) => s + r.vcTotal * r.areaHa, 0) / stdArea : 0;

    const wfPriceHa = wfArea > 0 ? wf.reduce((s, r) => s + r.grossOutputHa * r.areaHa, 0) / wfArea : 0;
    const stdPriceHa = stdArea > 0 ? std.reduce((s, r) => s + r.grossOutputHa * r.areaHa, 0) / stdArea : 0;

    return { wf, std, wfArea, stdArea, wfGMHa, stdGMHa, wfVCHa, stdVCHa, wfPriceHa, stdPriceHa };
  }, [budgetRows]);

  // Input prices grouped
  const priceGroups = useMemo(() => {
    const fert: PurchaseProduct[] = [];
    const chem: PurchaseProduct[] = [];
    const seed: PurchaseProduct[] = [];
    for (const order of purchases) {
      if (order.cancelled) continue;
      for (const p of order.products) {
        if (order.type === 'Fertiliser') fert.push(p);
        else if (order.type === 'Chemical') chem.push(p);
        else if (order.type === 'Seed') seed.push(p);
      }
    }
    return { fert, chem, seed };
  }, [purchases]);

  const hasPrices = purchases.length > 0;
  const hasPlans = croppingPlans.length > 0;
  const hasAgronomy = agronomyVisits.length > 0;

  const SEASONS_AVAILABLE = Array.from(new Set(croppingPlans.map(p => p.season))).sort();

  // ── Styles ────────────────────────────────────────────────────────────────
  const tabBtnStyle = (active: boolean): CSSProperties => ({
    padding: '6px 16px',
    background: active ? 'var(--green)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    border: '1px solid',
    borderColor: active ? 'var(--green)' : 'var(--border)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: active ? 600 : 400,
  });

  const seasonBtnStyle = (active: boolean): CSSProperties => ({
    padding: '4px 12px',
    background: active ? '#f0f9f0' : 'transparent',
    color: active ? 'var(--green)' : 'var(--text-muted)',
    border: '1px solid',
    borderColor: active ? 'var(--green)' : 'var(--border)',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: active ? 600 : 400,
  });

  const card: CSSProperties = {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '1rem 1.25rem',
    marginBottom: '1rem',
  };

  const summaryCard = (accent: string): CSSProperties => ({
    flex: 1,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '0.9rem 1.1rem',
    borderLeft: `3px solid ${accent}`,
  });

  const gmColour = (gm: number) => gm >= 400 ? '#2d7d46' : gm >= 200 ? '#c17b00' : gm >= 0 ? '#666' : '#c0392b';

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 20, color: 'var(--green)', marginBottom: 2 }}>Costings & Gross Margins</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Input prices from Crop Advisors · Recommendations from Luke Cotton · Operations from JD
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={tabBtnStyle(tab === 'budgets')} onClick={() => setTab('budgets')}>📊 Crop Budgets</button>
          <button style={tabBtnStyle(tab === 'fields')} onClick={() => setTab('fields')}>🌾 Field P&L</button>
          <button style={tabBtnStyle(tab === 'prices')} onClick={() => setTab('prices')}>🏷️ Input Prices</button>
        </div>
      </div>

      {/* ── DATA STATUS BANNER ── */}
      {(!hasPrices || !hasAgronomy) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 12, color: '#92400e', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>ℹ️ Data status:</span>
          {!hasPrices && <span>⚠️ <strong>Input prices:</strong> Not imported yet — go to 🛒 Purchases to load Crop Advisors orders</span>}
          {hasPrices && <span style={{ color: '#2d7d46' }}>✓ Input prices from {purchases.length} purchase order{purchases.length !== 1 ? 's' : ''}</span>}
          {!hasAgronomy && <span>⚠️ <strong>Agronomy rates:</strong> Not loaded — import Luke's visit reports via Agronomy section</span>}
          {hasAgronomy && <span style={{ color: '#2d7d46' }}>✓ {agronomyVisits.length} agronomy visit{agronomyVisits.length !== 1 ? 's' : ''} loaded</span>}
          {jdOps.length === 0 && <span>⚠️ <strong>JD operations:</strong> Not synced — connect John Deere Operations Centre</span>}
          {jdOps.length > 0 && <span style={{ color: '#2d7d46' }}>✓ {jdOps.length} JD operations loaded</span>}
          {!hasPrices && <span style={{ color: '#92400e', fontStyle: 'italic' }}>Variable costs shown below are UAF benchmark estimates until real data is imported.</span>}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: CROP BUDGETS
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'budgets' && (
        <>
          {/* Season selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Season:</span>
            {SEASONS_AVAILABLE.length > 0
              ? SEASONS_AVAILABLE.map(s => (
                  <button key={s} style={seasonBtnStyle(season === s)} onClick={() => setSeason(s)}>{s}</button>
                ))
              : ['25/26', '26/27'].map(s => (
                  <button key={s} style={seasonBtnStyle(season === s)} onClick={() => setSeason(s)}>{s}</button>
                ))
            }
          </div>

          {!hasPlans ? (
            <div style={{ ...card, textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🌾</div>
              <div style={{ fontFamily: 'Lora, serif', fontSize: 16, marginBottom: 8 }}>No cropping plan loaded</div>
              <div style={{ fontSize: 13 }}>Go to <strong>🌾 Cropping Plan</strong> and click <strong>↓ Load from Gatekeeper</strong> to populate field plans for 25/26 and 26/27.</div>
            </div>
          ) : !seasonPlan ? (
            <div style={{ ...card, textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14 }}>No plan loaded for {season}. Try loading from Gatekeeper in the Cropping Plan section.</div>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div style={summaryCard('#2d7d46')}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Arable Area</div>
                  <div style={{ fontSize: 22, fontFamily: 'Lora, serif', color: 'var(--green)', marginTop: 4 }}>{fmt(totals.totalArea, 0)} ha</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{budgetRows.length} fields</div>
                </div>
                <div style={summaryCard('#c17b00')}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gross Output</div>
                  <div style={{ fontSize: 22, fontFamily: 'Lora, serif', color: '#c17b00', marginTop: 4 }}>{fmtGBP(totals.totalOutput)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtGBP(totals.totalArea > 0 ? totals.totalOutput / totals.totalArea : 0)}/ha avg</div>
                </div>
                <div style={summaryCard('#c0392b')}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Variable Costs</div>
                  <div style={{ fontSize: 22, fontFamily: 'Lora, serif', color: '#c0392b', marginTop: 4 }}>{fmtGBP(totals.totalVC)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtGBP(totals.totalArea > 0 ? totals.totalVC / totals.totalArea : 0)}/ha avg {!hasPrices ? '(est.)' : ''}</div>
                </div>
                <div style={summaryCard(totals.avgGMHa >= 300 ? '#2d7d46' : '#c17b00')}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gross Margin</div>
                  <div style={{ fontSize: 22, fontFamily: 'Lora, serif', color: gmColour(totals.avgGMHa), marginTop: 4 }}>{fmtGBP(totals.totalGM)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtGBP(totals.avgGMHa)}/ha avg</div>
                </div>
              </div>

              {/* Wildfarmed vs Standard wheat comparison */}
              {wfComparison.wfArea > 0 && wfComparison.stdArea > 0 && (
                <div style={{ ...card, marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--green)' }}>
                    🌿 Wildfarmed vs Standard Wheat — Is the premium worth it?
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {/* Wildfarmed column */}
                    <div style={{ background: '#f0f9f0', borderRadius: 8, padding: '0.9rem 1.1rem', borderLeft: '3px solid #2d7d46' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#2d7d46', marginBottom: 8 }}>🌿 Wildfarmed  ({fmt(wfComparison.wfArea, 0)} ha)</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: '3px 0', color: 'var(--text-muted)' }}>Gross output</td>
                            <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600 }}>{fmtGBP(wfComparison.wfPriceHa)}/ha</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '3px 0', color: 'var(--text-muted)' }}>Variable costs {!hasPrices ? '(est.)' : ''}</td>
                            <td style={{ padding: '3px 0', textAlign: 'right', color: '#c0392b' }}>({fmtGBP(wfComparison.wfVCHa)}/ha)</td>
                          </tr>
                          <tr style={{ borderTop: '1px solid #ccc', fontWeight: 700 }}>
                            <td style={{ padding: '5px 0 2px' }}>Gross margin</td>
                            <td style={{ padding: '5px 0 2px', textAlign: 'right', color: gmColour(wfComparison.wfGMHa) }}>{fmtGBP(wfComparison.wfGMHa)}/ha</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '2px 0', color: 'var(--text-muted)' }}>Total GM</td>
                            <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600, color: gmColour(wfComparison.wfGMHa) }}>{fmtGBP(wfComparison.wfArea * wfComparison.wfGMHa)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {/* Standard wheat column */}
                    <div style={{ background: '#fafafa', borderRadius: 8, padding: '0.9rem 1.1rem', borderLeft: '3px solid #c17b00' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#c17b00', marginBottom: 8 }}>🌾 Standard Wheat  ({fmt(wfComparison.stdArea, 0)} ha)</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: '3px 0', color: 'var(--text-muted)' }}>Gross output</td>
                            <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600 }}>{fmtGBP(wfComparison.stdPriceHa)}/ha</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '3px 0', color: 'var(--text-muted)' }}>Variable costs {!hasPrices ? '(est.)' : ''}</td>
                            <td style={{ padding: '3px 0', textAlign: 'right', color: '#c0392b' }}>({fmtGBP(wfComparison.stdVCHa)}/ha)</td>
                          </tr>
                          <tr style={{ borderTop: '1px solid #ccc', fontWeight: 700 }}>
                            <td style={{ padding: '5px 0 2px' }}>Gross margin</td>
                            <td style={{ padding: '5px 0 2px', textAlign: 'right', color: gmColour(wfComparison.stdGMHa) }}>{fmtGBP(wfComparison.stdGMHa)}/ha</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '2px 0', color: 'var(--text-muted)' }}>Total GM</td>
                            <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600, color: gmColour(wfComparison.stdGMHa) }}>{fmtGBP(wfComparison.stdArea * wfComparison.stdGMHa)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* Verdict */}
                  <div style={{ marginTop: 10, padding: '0.65rem 0.9rem', background: '#f8f8f8', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    <strong>Premium:</strong> Wildfarmed at £240/t vs standard {fmtGBP(wfComparison.stdPriceHa / (wfComparison.std[0]?.yieldTha || 8), 0)}/t — price advantage of <strong>£{fmt(240 - (wfComparison.std[0]?.pricePerT || 192), 0)}/t</strong>.
                    Wildfarmed saves ~<strong>£{fmt(wfComparison.stdVCHa - wfComparison.wfVCHa, 0)}/ha</strong> on inputs (less N, fewer plant growth regulators).
                    Net GM advantage: <strong style={{ color: gmColour(wfComparison.wfGMHa - wfComparison.stdGMHa + 1) }}>{fmtGBP(wfComparison.wfGMHa - wfComparison.stdGMHa)}/ha</strong> {!hasPrices ? '(benchmark est. — import real prices for accuracy)' : ''}.
                  </div>
                </div>
              )}

              {/* Per-crop summary table */}
              <div style={card}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Variable Cost Build-up {!hasPrices ? <span style={{ fontSize: 11, color: '#92400e', fontWeight: 400 }}>(benchmark estimates — import Crop Advisors orders for actuals)</span> : <span style={{ fontSize: 11, color: '#2d7d46', fontWeight: 400 }}>using actual purchase prices</span>}</div>
                {(() => {
                  // Group by crop type
                  const cropGroups = new Map<string, BudgetRow[]>();
                  for (const r of budgetRows) {
                    const key = r.contractType === 'Wildfarmed' ? 'Wildfarmed wheat' : r.crop;
                    if (!cropGroups.has(key)) cropGroups.set(key, []);
                    cropGroups.get(key)!.push(r);
                  }
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={TH}>Crop</th>
                            <th style={THR}>Area (ha)</th>
                            <th style={THR}>Seed £/ha</th>
                            <th style={THR}>Fert £/ha</th>
                            <th style={THR}>Spray £/ha</th>
                            <th style={THR}>Contract £/ha</th>
                            <th style={{ ...THR, color: '#c0392b' }}>Total VC/ha</th>
                            <th style={THR}>Output/ha</th>
                            <th style={{ ...THR, fontWeight: 700 }}>GM/ha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(cropGroups.entries()).map(([cropKey, rows]) => {
                            const area = rows.reduce((s, r) => s + r.areaHa, 0);
                            const avgVC = rows.reduce((s, r) => s + r.vcTotal, 0) / rows.length;
                            const avgSeed = rows.reduce((s, r) => s + r.vcSeed, 0) / rows.length;
                            const avgFert = rows.reduce((s, r) => s + r.vcFert, 0) / rows.length;
                            const avgSpray = rows.reduce((s, r) => s + r.vcSpray, 0) / rows.length;
                            const avgContract = rows.reduce((s, r) => s + r.vcContract, 0) / rows.length;
                            const avgOut = rows.reduce((s, r) => s + r.grossOutputHa, 0) / rows.length;
                            const avgGM = rows.reduce((s, r) => s + r.grossMarginHa, 0) / rows.length;
                            const isWF = cropKey === 'Wildfarmed wheat';
                            return (
                              <tr key={cropKey} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ ...TD, fontWeight: 600, color: isWF ? '#2d7d46' : '#333' }}>
                                  {isWF ? '🌿 ' : ''}{cropKey}
                                </td>
                                <td style={TDR}>{fmt(area, 1)}</td>
                                <td style={TDR}>{fmtGBP(avgSeed)}</td>
                                <td style={TDR}>{fmtGBP(avgFert)}</td>
                                <td style={TDR}>{fmtGBP(avgSpray)}</td>
                                <td style={TDR}>{fmtGBP(avgContract)}</td>
                                <td style={{ ...TDR, color: '#c0392b', fontWeight: 600 }}>({fmtGBP(avgVC)})</td>
                                <td style={TDR}>{fmtGBP(avgOut)}</td>
                                <td style={{ ...TDR, fontWeight: 700, color: gmColour(avgGM) }}>{fmtGBP(avgGM)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: FIELD P&L
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'fields' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Season:</span>
            {SEASONS_AVAILABLE.length > 0
              ? SEASONS_AVAILABLE.map(s => (
                  <button key={s} style={seasonBtnStyle(season === s)} onClick={() => setSeason(s)}>{s}</button>
                ))
              : ['25/26', '26/27'].map(s => (
                  <button key={s} style={seasonBtnStyle(season === s)} onClick={() => setSeason(s)}>{s}</button>
                ))
            }
          </div>

          {!hasPlans ? (
            <div style={{ ...card, textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14 }}>Load a cropping plan first — go to 🌾 Cropping Plan and load from Gatekeeper.</div>
            </div>
          ) : budgetRows.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14 }}>No arable field plans for {season}.</div>
            </div>
          ) : (
            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Field</th>
                      <th style={TH}>Crop</th>
                      <th style={TH}>Variety / Contract</th>
                      <th style={THR}>Area ha</th>
                      <th style={THR}>Yield t/ha</th>
                      <th style={THR}>Price £/t</th>
                      <th style={THR}>Output £/ha</th>
                      <th style={{ ...THR, color: '#c0392b' }}>VC £/ha</th>
                      <th style={{ ...THR, fontWeight: 700 }}>GM £/ha</th>
                      <th style={{ ...THR, fontWeight: 700 }}>Total GM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetRows
                      .sort((a, b) => b.grossMarginHa - a.grossMarginHa)
                      .map((row, i) => {
                        const isWF = row.contractType === 'Wildfarmed';
                        return (
                          <tr key={row.fieldParcel} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ ...TD, fontWeight: 600 }}>{row.fieldName}</td>
                            <td style={{ ...TD, color: isWF ? '#2d7d46' : '#333' }}>{isWF ? '🌿 ' : ''}{row.crop}</td>
                            <td style={{ ...TD, color: 'var(--text-muted)' }}>{row.variety || '—'}{row.contractType && row.contractType !== 'N/A' ? ` · ${row.contractType}` : ''}</td>
                            <td style={TDR}>{fmt(row.areaHa, 1)}</td>
                            <td style={TDR}>{row.yieldTha > 0 ? fmt(row.yieldTha, 1) : <span style={{ color: '#ccc' }}>—</span>}</td>
                            <td style={TDR}>{row.pricePerT > 0 ? fmtGBP(row.pricePerT) : <span style={{ color: '#ccc' }}>—</span>}</td>
                            <td style={TDR}>{row.grossOutputHa > 0 ? fmtGBP(row.grossOutputHa) : <span style={{ color: '#ccc' }}>—</span>}</td>
                            <td style={{ ...TDR, color: '#c0392b' }}>({fmtGBP(row.vcTotal)}){row.dataSource === 'benchmark' ? <span title="Benchmark estimate">*</span> : null}</td>
                            <td style={{ ...TDR, fontWeight: 700, color: row.grossOutputHa > 0 ? gmColour(row.grossMarginHa) : '#ccc' }}>
                              {row.grossOutputHa > 0 ? fmtGBP(row.grossMarginHa) : '—'}
                            </td>
                            <td style={{ ...TDR, fontWeight: 700, color: row.grossOutputHa > 0 ? gmColour(row.grossMarginHa) : '#ccc' }}>
                              {row.grossOutput > 0 ? fmtGBP(row.grossMargin) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    {/* Totals row */}
                    <tr style={{ borderTop: '2px solid var(--border)', background: '#f5f5f5', fontWeight: 700 }}>
                      <td style={{ ...TD, fontWeight: 700 }} colSpan={3}>TOTAL / AVERAGE</td>
                      <td style={TDR}>{fmt(totals.totalArea, 1)}</td>
                      <td style={TDR} colSpan={2}></td>
                      <td style={TDR}>{fmtGBP(totals.totalArea > 0 ? totals.totalOutput / totals.totalArea : 0)}/ha</td>
                      <td style={{ ...TDR, color: '#c0392b' }}>({fmtGBP(totals.totalArea > 0 ? totals.totalVC / totals.totalArea : 0)}/ha)</td>
                      <td style={{ ...TDR, color: gmColour(totals.avgGMHa) }}>{fmtGBP(totals.avgGMHa)}/ha</td>
                      <td style={{ ...TDR, color: gmColour(totals.avgGMHa) }}>{fmtGBP(totals.totalGM)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {!hasPrices && (
                <div style={{ fontSize: 11, color: '#92400e', marginTop: 8 }}>
                  * Variable costs marked with * are UAF benchmark estimates. Import Crop Advisors purchase orders via 🛒 Purchases to get real figures.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: INPUT PRICES
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'prices' && (
        <>
          {!hasPrices ? (
            <div style={{ ...card, textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
              <div style={{ fontFamily: 'Lora, serif', fontSize: 16, marginBottom: 8, color: 'var(--green)' }}>No purchase orders loaded yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 440, margin: '0 auto' }}>
                Import your Crop Advisors PDF purchase orders via the <strong>🛒 Purchases</strong> section. Once loaded, real input prices will be used for all gross margin calculations here, replacing the benchmark estimates.
              </div>
            </div>
          ) : (
            <>
              {/* Fertiliser */}
              {priceGroups.fert.length > 0 && (
                <div style={card}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#2d7d46' }}>🌿 Fertiliser</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Product</th>
                          <th style={THR}>Quantity</th>
                          <th style={TH}>Unit</th>
                          <th style={THR}>Price</th>
                          <th style={TH}>Price Unit</th>
                          <th style={THR}>Total Value</th>
                          <th style={THR}>Cost/ha (200 kg/ha)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceGroups.fert.map((p, i) => {
                          const puLower = (p.priceUnit || '').toLowerCase();
                          const isPerT = puLower.includes('tonne') || puLower.includes('/t');
                          const costAt200 = isPerT ? (200 / 1000) * p.pricePerUnit : 0;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ ...TD, fontWeight: 600 }}>{p.name}</td>
                              <td style={TDR}>{fmt(p.quantity, 1)}</td>
                              <td style={TD}>{p.unit}</td>
                              <td style={{ ...TDR, fontWeight: 600 }}>{fmtGBP(p.pricePerUnit, 2)}</td>
                              <td style={TD}>{p.priceUnit}</td>
                              <td style={TDR}>{fmtGBP(p.totalValue)}</td>
                              <td style={{ ...TDR, color: '#c0392b' }}>{isPerT ? fmtGBP(costAt200) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Chemical */}
              {priceGroups.chem.length > 0 && (
                <div style={card}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#c17b00' }}>🧪 Chemical</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Product</th>
                          <th style={THR}>Quantity</th>
                          <th style={TH}>Unit</th>
                          <th style={THR}>Price</th>
                          <th style={TH}>Price Unit</th>
                          <th style={THR}>Total Value</th>
                          {hasAgronomy && <th style={THR}>Agronomy Rate</th>}
                          {hasAgronomy && <th style={THR}>Cost/ha</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {priceGroups.chem.map((p, i) => {
                          // Try to find this product in agronomy visits
                          const agroProd = agronomyVisits
                            .flatMap(v => v.jobs.flatMap(j => j.products))
                            .find(ap => ap.name.toLowerCase().trim() === p.name.toLowerCase().trim());
                          const costPerHa = agroProd
                            ? (() => {
                                const puLower = (p.priceUnit || '').toLowerCase();
                                if (puLower.includes('litre') || puLower === 'per litre' || puLower.includes('/l')) {
                                  return agroProd.ratePerHa * p.pricePerUnit;
                                }
                                return 0;
                              })()
                            : 0;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ ...TD, fontWeight: 600 }}>{p.name}</td>
                              <td style={TDR}>{fmt(p.quantity, 1)}</td>
                              <td style={TD}>{p.unit}</td>
                              <td style={{ ...TDR, fontWeight: 600 }}>{fmtGBP(p.pricePerUnit, 2)}</td>
                              <td style={TD}>{p.priceUnit}</td>
                              <td style={TDR}>{fmtGBP(p.totalValue)}</td>
                              {hasAgronomy && <td style={{ ...TDR, color: 'var(--text-muted)' }}>{agroProd ? `${agroProd.ratePerHa} ${agroProd.unit}/ha` : '—'}</td>}
                              {hasAgronomy && <td style={{ ...TDR, color: costPerHa > 0 ? '#c0392b' : 'var(--text-muted)' }}>{costPerHa > 0 ? fmtGBP(costPerHa, 2) : '—'}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Seed */}
              {priceGroups.seed.length > 0 && (
                <div style={card}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#6b5e00' }}>🌱 Seed</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Product / Variety</th>
                          <th style={THR}>Quantity</th>
                          <th style={TH}>Unit</th>
                          <th style={THR}>Price</th>
                          <th style={TH}>Price Unit</th>
                          <th style={THR}>Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceGroups.seed.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ ...TD, fontWeight: 600 }}>{p.name}</td>
                            <td style={TDR}>{fmt(p.quantity, 1)}</td>
                            <td style={TD}>{p.unit}</td>
                            <td style={{ ...TDR, fontWeight: 600 }}>{fmtGBP(p.pricePerUnit, 2)}</td>
                            <td style={TD}>{p.priceUnit}</td>
                            <td style={TDR}>{fmtGBP(p.totalValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Agronomy rates summary */}
              {hasAgronomy && (
                <div style={card}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#2d7d46' }}>
                    🧑‍🌾 Luke Cotton's Application Rates ({agronomyVisits.length} visit{agronomyVisits.length !== 1 ? 's' : ''})
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Product</th>
                          <th style={THR}>Rate /ha</th>
                          <th style={TH}>Unit</th>
                          <th style={TH}>Job reason</th>
                          <th style={TH}>Date window</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const seen = new Set<string>();
                          return agronomyVisits.flatMap(v =>
                            v.jobs.flatMap(j =>
                              j.products.map(p => {
                                const key = `${p.name}-${j.reason}`;
                                if (seen.has(key)) return null;
                                seen.add(key);
                                return (
                                  <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ ...TD, fontWeight: 600 }}>{p.name}</td>
                                    <td style={TDR}>{p.ratePerHa}</td>
                                    <td style={TD}>{p.unit}</td>
                                    <td style={{ ...TD, color: 'var(--text-muted)' }}>{j.reason}</td>
                                    <td style={{ ...TD, color: 'var(--text-muted)' }}>
                                      {j.earliestDate && j.latestDate ? `${j.earliestDate} – ${j.latestDate}` : j.earliestDate || '—'}
                                    </td>
                                  </tr>
                                );
                              }).filter(Boolean)
                            )
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
