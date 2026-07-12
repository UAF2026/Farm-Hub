'use client';

import { useState, useMemo } from 'react';
import type { FarmData, FieldCropPlan, CroppingPlanSeason, CropType, ContractType } from '@/lib/types';

// ── Crop economics benchmarks ─────────────────────────────────────────────────
// Variable costs (seed + fert + spray + contract) in £/ha
// Gross output = yield × price
// Gross margin = gross output - variable costs
// These are editable per plan but seeded with UAF benchmarks

interface CropBenchmark {
  label: string;
  defaultYield: number;   // t/ha
  defaultPrice: number;   // £/t
  defaultVC: number;      // £/ha variable costs
  contracts: ContractType[];
  colour: string;
}

const BENCHMARKS: Record<string, CropBenchmark> = {
  'Winter wheat': { label: 'Winter wheat', defaultYield: 8.0, defaultPrice: 192, defaultVC: 620, contracts: ['Milling', 'Feed', 'Wildfarmed'], colour: '#c17b00' },
  'Winter barley': { label: 'Winter barley', defaultYield: 7.0, defaultPrice: 165, defaultVC: 540, contracts: ['Feed', 'Malting'], colour: '#8b5e00' },
  'Spring barley': { label: 'Spring barley', defaultYield: 5.5, defaultPrice: 165, defaultVC: 420, contracts: ['Feed', 'Malting'], colour: '#b8860b' },
  'Spring wheat': { label: 'Spring wheat', defaultYield: 6.0, defaultPrice: 192, defaultVC: 480, contracts: ['Milling', 'Feed'], colour: '#d4a017' },
  'OSR': { label: 'OSR', defaultYield: 3.5, defaultPrice: 380, defaultVC: 680, contracts: ['Feed', 'N/A'], colour: '#5b8a00' },
  'Legume fallow': { label: 'Legume fallow', defaultYield: 0, defaultPrice: 0, defaultVC: 80, contracts: ['N/A'], colour: '#6b7280' },
  'Cover crop': { label: 'Cover crop', defaultYield: 0, defaultPrice: 0, defaultVC: 120, contracts: ['N/A'], colour: '#4b7c59' },
  'Grass': { label: 'Grass', defaultYield: 0, defaultPrice: 0, defaultVC: 60, contracts: ['N/A'], colour: '#2d7d46' },
  'Herbal ley': { label: 'Herbal ley', defaultYield: 0, defaultPrice: 0, defaultVC: 80, contracts: ['N/A'], colour: '#3a6b4e' },
  'Other': { label: 'Other', defaultYield: 0, defaultPrice: 0, defaultVC: 0, contracts: ['N/A'], colour: '#9ca3af' },
};

const CROP_TYPES: CropType[] = ['Winter wheat', 'Winter barley', 'Spring barley', 'Spring wheat', 'OSR', 'Legume fallow', 'Cover crop', 'Grass', 'Herbal ley', 'Other'];
const SEASONS = ['25/26', '26/27', '27/28'];

function grossMargin(plan: FieldCropPlan): number {
  if (!plan.plannedCrop || !plan.targetYieldTha || !plan.estimatedPricePerT) return 0;
  const b = BENCHMARKS[plan.plannedCrop];
  if (!b) return 0;
  const vc = b.defaultVC; // £/ha
  const go = (plan.targetYieldTha || 0) * (plan.estimatedPricePerT || 0);
  return Math.round((go - vc) * 100) / 100;
}

function grossMarginPerField(plan: FieldCropPlan): number {
  return Math.round(grossMargin(plan) * plan.areaHa * 100) / 100;
}

function fmt(n: number, dp = 0) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function CroppingPlan({ db, persist }: { db: FarmData; persist: (d: FarmData) => void }) {
  const [season, setSeason] = useState<string>('26/27');
  const [editingParcel, setEditingParcel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'plan' | 'summary' | 'economics'>('plan');
  const [showOnlyArable, setShowOnlyArable] = useState(true);

  const plans = db.croppingPlans ?? [];
  const seasonPlan = plans.find(p => p.season === season);

  // Build the working plan for this season — merge saved plans with field list
  const allFields = useMemo(() => {
    const dbFields = db.fields ?? [];
    return dbFields.filter(f => {
      if (!showOnlyArable) return true;
      // Include arable fields only (exclude permanent grass unless user wants all)
      return !['Grass', 'Herbal ley'].includes(f.status);
    });
  }, [db.fields, showOnlyArable]);

  const workingPlans = useMemo((): FieldCropPlan[] => {
    return allFields.map(f => {
      const saved = seasonPlan?.plans.find(p => p.fieldParcel === (f.parcel || f.name));
      const b = saved?.plannedCrop ? BENCHMARKS[saved.plannedCrop] : null;
      return saved ?? {
        fieldParcel: f.parcel || f.name,
        fieldName: f.name,
        areaHa: f.area,
        plannedCrop: '' as CropType | '',
        variety: '',
        contractType: 'N/A' as ContractType,
        targetYieldTha: b?.defaultYield ?? 0,
        estimatedPricePerT: b?.defaultPrice ?? 0,
        previousCrop: f.crop || '',
        notes: '',
      };
    });
  }, [allFields, seasonPlan]);

  // Get previous season plan for rotation logic
  const prevSeasonLabel = season === '26/27' ? '25/26' : season === '27/28' ? '26/27' : '';
  const prevPlan = plans.find(p => p.season === prevSeasonLabel);

  function savePlan(updated: FieldCropPlan[]) {
    const newSeasonPlan: CroppingPlanSeason = {
      season,
      plans: updated,
      lastUpdated: new Date().toISOString(),
    };
    const newPlans = [
      ...plans.filter(p => p.season !== season),
      newSeasonPlan,
    ];
    persist({ ...db, croppingPlans: newPlans });
  }

  function updateField(parcel: string, changes: Partial<FieldCropPlan>) {
    const updated = workingPlans.map(p => {
      if (p.fieldParcel !== parcel) return p;
      const merged = { ...p, ...changes };
      // Auto-populate yield and price from benchmark when crop changes
      if (changes.plannedCrop && changes.plannedCrop !== p.plannedCrop) {
        const b = BENCHMARKS[changes.plannedCrop];
        if (b) {
          merged.targetYieldTha = b.defaultYield;
          merged.estimatedPricePerT = b.defaultPrice;
          merged.contractType = b.contracts[0] as ContractType;
        }
      }
      return merged;
    });
    savePlan(updated);
  }

  // Summary stats
  const planned = workingPlans.filter(p => p.plannedCrop);
  const totalHa = workingPlans.reduce((s, p) => s + p.areaHa, 0);
  const plannedHa = planned.reduce((s, p) => s + p.areaHa, 0);
  const totalGM = planned.reduce((s, p) => s + grossMarginPerField(p), 0);

  const byCrop = useMemo(() => {
    const map: Record<string, { ha: number; gm: number; count: number }> = {};
    for (const p of planned) {
      if (!p.plannedCrop) continue;
      if (!map[p.plannedCrop]) map[p.plannedCrop] = { ha: 0, gm: 0, count: 0 };
      map[p.plannedCrop].ha += p.areaHa;
      map[p.plannedCrop].gm += grossMarginPerField(p);
      map[p.plannedCrop].count++;
    }
    return Object.entries(map).sort((a, b) => b[1].ha - a[1].ha);
  }, [planned]);

  // Rotation warnings
  function rotationWarning(plan: FieldCropPlan): string {
    const prev = prevPlan?.plans.find(p => p.fieldParcel === plan.fieldParcel);
    const prevCrop = prev?.plannedCrop || plan.previousCrop;
    if (!prevCrop || !plan.plannedCrop) return '';
    if (prevCrop === plan.plannedCrop && plan.plannedCrop === 'Winter wheat') return '⚠️ Back-to-back wheat';
    if (prevCrop === plan.plannedCrop && plan.plannedCrop === 'OSR') return '⚠️ Back-to-back OSR';
    if (prevCrop === 'Winter wheat' && plan.plannedCrop === 'Winter wheat') return '⚠️ W-W';
    return '';
  }

  return (
    <div className="section-wrap">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 20, color: 'var(--green)' }}>Cropping Plan</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {fmt(plannedHa, 1)} of {fmt(totalHa, 1)} ha planned · Est. GM £{fmt(totalGM)}
          </div>
        </div>
        {/* Season selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SEASONS.map(s => (
            <button
              key={s}
              onClick={() => setSeason(s)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'DM Sans, sans-serif',
                background: season === s ? 'var(--green)' : 'var(--card)',
                color: season === s ? '#fff' : 'var(--text)',
                fontWeight: season === s ? 600 : 400,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {byCrop.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
          {byCrop.map(([crop, stats]) => {
            const b = BENCHMARKS[crop];
            return (
              <div key={crop} className="card" style={{ padding: '8px 12px', borderTop: `3px solid ${b?.colour || '#ccc'}` }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{crop}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: b?.colour || 'var(--text)' }}>{fmt(stats.ha, 1)} ha</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>GM £{fmt(stats.gm)}</div>
              </div>
            );
          })}
          <div className="card" style={{ padding: '8px 12px', borderTop: '3px solid var(--green)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Total GM</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--green)' }}>£{fmt(totalGM)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(totalHa, 1)} ha</div>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['plan', 'summary', 'economics'] as const).map(v => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{
              padding: '4px 14px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'DM Sans, sans-serif',
              background: viewMode === v ? 'var(--green)' : 'var(--card)',
              color: viewMode === v ? '#fff' : 'var(--text)',
            }}
          >
            {v === 'plan' ? '📋 Field plan' : v === 'summary' ? '📊 Summary' : '💰 Economics'}
          </button>
        ))}
        <label style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showOnlyArable} onChange={e => setShowOnlyArable(e.target.checked)} />
          Arable only
        </label>
      </div>

      {/* ── Field plan view ── */}
      {viewMode === 'plan' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--card)', borderBottom: '2px solid var(--border)' }}>
                <th style={TH}>Field</th>
                <th style={{ ...TH, textAlign: 'right' }}>Ha</th>
                <th style={TH}>Prev crop</th>
                <th style={TH}>Planned crop 26/27</th>
                <th style={TH}>Variety</th>
                <th style={TH}>Contract</th>
                <th style={{ ...TH, textAlign: 'right' }}>Yield t/ha</th>
                <th style={{ ...TH, textAlign: 'right' }}>£/t</th>
                <th style={{ ...TH, textAlign: 'right' }}>GM/ha</th>
                <th style={{ ...TH, textAlign: 'right' }}>GM £</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {workingPlans.map(plan => {
                const b = plan.plannedCrop ? BENCHMARKS[plan.plannedCrop] : null;
                const gm = grossMargin(plan);
                const gmTotal = grossMarginPerField(plan);
                const warn = rotationWarning(plan);
                const isEditing = editingParcel === plan.fieldParcel;
                const prevCropDisplay = prevPlan?.plans.find(p => p.fieldParcel === plan.fieldParcel)?.plannedCrop || plan.previousCrop || '—';

                return (
                  <tr key={plan.fieldParcel} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? '#f0f8f3' : undefined }}>
                    <td style={TD}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{plan.fieldName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{plan.fieldParcel}</div>
                      {warn && <div style={{ fontSize: 11, color: '#c17b00', marginTop: 2 }}>{warn}</div>}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{plan.areaHa.toFixed(1)}</td>
                    <td style={{ ...TD, color: 'var(--text-muted)', fontSize: 12 }}>{prevCropDisplay}</td>

                    {/* Planned crop */}
                    <td style={TD}>
                      <select
                        value={plan.plannedCrop || ''}
                        onChange={e => updateField(plan.fieldParcel, { plannedCrop: e.target.value as CropType })}
                        style={{
                          fontSize: 12,
                          padding: '3px 6px',
                          border: `1px solid ${b ? b.colour : '#ddd'}`,
                          borderRadius: 4,
                          background: b ? `${b.colour}15` : 'transparent',
                          color: b ? b.colour : 'var(--text-muted)',
                          fontWeight: b ? 600 : 400,
                          cursor: 'pointer',
                          minWidth: 140,
                        }}
                      >
                        <option value="">— not planned —</option>
                        {CROP_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>

                    {/* Variety */}
                    <td style={TD}>
                      <input
                        type="text"
                        value={plan.variety || ''}
                        onChange={e => updateField(plan.fieldParcel, { variety: e.target.value })}
                        placeholder="variety"
                        style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4, width: 100 }}
                      />
                    </td>

                    {/* Contract */}
                    <td style={TD}>
                      <select
                        value={plan.contractType || 'N/A'}
                        onChange={e => updateField(plan.fieldParcel, { contractType: e.target.value as ContractType })}
                        style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4 }}
                      >
                        {['Milling', 'Feed', 'Malting', 'Wildfarmed', 'N/A'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>

                    {/* Yield */}
                    <td style={{ ...TD, textAlign: 'right' }}>
                      {plan.plannedCrop && !['Legume fallow', 'Cover crop', 'Grass', 'Herbal ley', 'Other'].includes(plan.plannedCrop) ? (
                        <input
                          type="number"
                          value={plan.targetYieldTha || ''}
                          onChange={e => updateField(plan.fieldParcel, { targetYieldTha: parseFloat(e.target.value) || 0 })}
                          step="0.1"
                          min="0"
                          style={{ fontSize: 12, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 4, width: 56, textAlign: 'right' }}
                        />
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>

                    {/* Price */}
                    <td style={{ ...TD, textAlign: 'right' }}>
                      {plan.plannedCrop && !['Legume fallow', 'Cover crop', 'Grass', 'Herbal ley', 'Other'].includes(plan.plannedCrop) ? (
                        <input
                          type="number"
                          value={plan.estimatedPricePerT || ''}
                          onChange={e => updateField(plan.fieldParcel, { estimatedPricePerT: parseFloat(e.target.value) || 0 })}
                          step="1"
                          min="0"
                          style={{ fontSize: 12, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 4, width: 60, textAlign: 'right' }}
                        />
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>

                    {/* GM/ha */}
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: gm > 0 ? '#2d7d46' : gm < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                      {plan.plannedCrop ? `£${fmt(gm)}` : '—'}
                    </td>

                    {/* GM total */}
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: gmTotal > 0 ? '#2d7d46' : 'var(--text-muted)' }}>
                      {plan.plannedCrop ? `£${fmt(gmTotal)}` : '—'}
                    </td>

                    <td style={TD}>
                      {plan.plannedCrop && (
                        <button
                          onClick={() => updateField(plan.fieldParcel, { plannedCrop: '' as CropType | '', variety: '', notes: '' })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 13 }}
                          title="Clear"
                        >✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={TD}>TOTAL</td>
                <td style={{ ...TD, textAlign: 'right' }}>{fmt(totalHa, 1)}</td>
                <td colSpan={6} />
                <td style={{ ...TD, textAlign: 'right', color: '#2d7d46' }}>£{fmt(totalGM / (plannedHa || 1))}/ha</td>
                <td style={{ ...TD, textAlign: 'right', color: '#2d7d46' }}>£{fmt(totalGM)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Summary view ── */}
      {viewMode === 'summary' && (
        <div>
          {byCrop.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🌾</div>
              <div>No crops planned yet — go to Field Plan to start assigning crops</div>
            </div>
          ) : (
            <>
              {byCrop.map(([crop, stats]) => {
                const b = BENCHMARKS[crop];
                const pct = totalHa > 0 ? (stats.ha / totalHa) * 100 : 0;
                return (
                  <div key={crop} className="card" style={{ marginBottom: 10, borderLeft: `4px solid ${b?.colour || '#ccc'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: b?.colour }}>{crop}</div>
                      <div>
                        <span style={{ fontWeight: 700 }}>{fmt(stats.ha, 1)} ha</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{Math.round(pct)}% of farm</span>
                        <span style={{ fontWeight: 700, marginLeft: 16, color: '#2d7d46' }}>GM £{fmt(stats.gm)}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>£{fmt(stats.gm / stats.ha)}/ha</span>
                      </div>
                    </div>
                    <div style={{ height: 8, background: '#eee', borderRadius: 4 }}>
                      <div style={{ height: 8, background: b?.colour, borderRadius: 4, width: `${pct}%` }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {workingPlans.filter(p => p.plannedCrop === crop).map(p => p.fieldName).join(', ')}
                    </div>
                  </div>
                );
              })}

              <div className="card" style={{ marginTop: 16, borderTop: '3px solid var(--green)', padding: '14px 16px' }}>
                <div style={{ fontFamily: 'Lora, serif', fontSize: 16, color: 'var(--green)', marginBottom: 10 }}>
                  {season} Plan — Financial Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <StatBox label="Total area" value={`${fmt(totalHa, 1)} ha`} />
                  <StatBox label="Planned" value={`${fmt(plannedHa, 1)} ha`} />
                  <StatBox label="Total est. GM" value={`£${fmt(totalGM)}`} highlight />
                  <StatBox label="Average GM/ha" value={`£${fmt(totalGM / (plannedHa || 1))}`} highlight />
                  <StatBox label="Unplanned" value={`${fmt(totalHa - plannedHa, 1)} ha`} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Economics view ── */}
      {viewMode === 'economics' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Benchmark gross margins used for planning. Variable costs include seed, fertiliser, sprays and contract operations. Adjust yield and price per field in the Field Plan view.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--card)', borderBottom: '2px solid var(--border)' }}>
                  <th style={TH}>Crop</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Target yield t/ha</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Price £/t</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Gross output £/ha</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Var costs £/ha</th>
                  <th style={{ ...TH, textAlign: 'right' }}>GM £/ha</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(BENCHMARKS).filter(([, b]) => b.defaultYield > 0 || b.defaultVC > 0).map(([crop, b]) => {
                  const go = b.defaultYield * b.defaultPrice;
                  const gm = go - b.defaultVC;
                  return (
                    <tr key={crop} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={TD}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: b.colour, marginRight: 8 }} />
                        <strong>{crop}</strong>
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>{b.defaultYield > 0 ? b.defaultYield : '—'}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{b.defaultPrice > 0 ? `£${b.defaultPrice}` : '—'}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{go > 0 ? `£${fmt(go)}` : '—'}</td>
                      <td style={{ ...TD, textAlign: 'right', color: 'var(--red)' }}>£{fmt(b.defaultVC)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: gm > 0 ? '#2d7d46' : 'var(--red)' }}>
                        {go > 0 ? `£${fmt(gm)}` : `(£${fmt(b.defaultVC)})`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--text)' }}>Variable cost assumptions:</strong> Fert based on YaraBela £340/t and Fertiberia £324/t from Crop Advisors. Seed and spray costs from UAF averages. Contract operations at prevailing rates. Fixed costs (machinery, labour, rent) not included — these need to be subtracted to get net margin.
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: highlight ? '#2d7d46' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 8px',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '6px 8px',
  verticalAlign: 'middle',
};
