'use client';

import { useState, useMemo } from 'react';
import { FarmData, SapTest, SapTestReadings, SoilTestResult } from '@/lib/types';
import { uid } from '@/lib/utils';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  addActivity: (msg: string) => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Traffic-light colour for pH
function phColor(ph?: number): string {
  if (ph === undefined) return '';
  if (ph >= 6.0 && ph <= 7.0) return 'bg-green';
  if (ph >= 5.5 && ph < 6.0) return 'bg-amber';
  if (ph > 7.0 && ph <= 7.5) return 'bg-amber';
  return 'bg-red';
}

// Traffic-light for nutrient index (0=red,1=amber,2=green,3=green,4=amber over)
function indexColor(idx?: string): string {
  if (!idx) return '';
  if (idx === '0') return 'bg-red';
  if (idx === '1') return 'bg-amber';
  if (idx === '2' || idx === '3') return 'bg-green';
  if (idx === '4') return 'bg-amber';
  return '';
}

function indexLabel(val?: number, idx?: string): string {
  if (idx) return `Index ${idx}${val !== undefined ? ` (${val})` : ''}`;
  if (val !== undefined) return String(val);
  return '—';
}

function omColor(om?: number): string {
  if (om === undefined) return '';
  if (om >= 3.5) return 'bg-green';
  if (om >= 2.5) return 'bg-amber';
  return 'bg-red';
}

// Source badge colour
function sourceColor(s: string): string {
  if (s === 'Nutriscope') return 'bg-green';
  if (s === 'SOYL') return 'bg-blue';
  if (s === 'Independent') return 'bg-amber';
  return '';
}

/* ─── Per-field summary ─────────────────────────────────────────────────── */
interface FieldSummary {
  field: string;
  latestTest?: SoilTestResult;
  latestSap?: SapTest;
  testCount: number;
  sapCount: number;
  issues: string[];
}

function buildFieldSummaries(
  fields: string[],
  soilTests: SoilTestResult[],
  sapTests: SapTest[]
): FieldSummary[] {
  return fields.map(field => {
    const myTests = soilTests.filter(t => t.field === field).sort((a, b) => b.date.localeCompare(a.date));
    const mySaps = sapTests.filter(t => t.field === field).sort((a, b) => b.date.localeCompare(a.date));
    const latest = myTests[0];
    const issues: string[] = [];
    if (latest) {
      if (latest.ph !== undefined && (latest.ph < 6.0 || latest.ph > 7.5)) issues.push(`pH ${latest.ph}`);
      if (latest.phosphorusIndex === '0' || latest.phosphorusIndex === '1') issues.push(`P low (Index ${latest.phosphorusIndex})`);
      if (latest.potassiumIndex === '0' || latest.potassiumIndex === '1') issues.push(`K low (Index ${latest.potassiumIndex})`);
      if (latest.magnesiumIndex === '0' || latest.magnesiumIndex === '1') issues.push(`Mg low (Index ${latest.magnesiumIndex})`);
      if (latest.organicMatter !== undefined && latest.organicMatter < 2.5) issues.push(`Low OM (${latest.organicMatter}%)`);
    }
    return { field, latestTest: latest, latestSap: mySaps[0], testCount: myTests.length, sapCount: mySaps.length, issues };
  });
}

/* ─── Default form state ────────────────────────────────────────────────── */
const EMPTY_FORM: Omit<SoilTestResult, 'id'> = {
  date: new Date().toISOString().slice(0, 10),
  field: '',
  source: 'Nutriscope',
  lab: '',
  depth: '0-15cm',
  ph: undefined,
  phosphorus: undefined,
  phosphorusIndex: '',
  potassium: undefined,
  potassiumIndex: '',
  magnesium: undefined,
  magnesiumIndex: '',
  organicMatter: undefined,
  organicCarbon: undefined,
  nitrogen: undefined,
  sulphur: undefined,
  boron: undefined,
  manganese: undefined,
  zinc: undefined,
  copper: undefined,
  soilType: '',
  texture: '',
  bulkDensity: undefined,
  notes: '',
  recommendation: '',
  soylZone: '',
  vrNRate: undefined,
  vrPRate: undefined,
  vrKRate: undefined,
};

interface SapForm {
  date: string; field: string; crop: string; variety: string; growthStage: string;
  leaf: 'new' | 'old' | 'both';
  brixNew: string; brixOld: string; ph: string; ec: string;
  nitrate: string; ammonium: string; potassium: string; calcium: string;
  magnesium: string; sodium: string; chloride: string;
  weather: string; notes: string; recommendation: string;
}

const EMPTY_SAP_FORM: SapForm = {
  date: new Date().toISOString().slice(0, 10),
  field: '',
  crop: '',
  variety: '',
  growthStage: '',
  leaf: 'both',
  brixNew: '',
  brixOld: '',
  ph: '',
  ec: '',
  nitrate: '',
  ammonium: '',
  potassium: '',
  calcium: '',
  magnesium: '',
  sodium: '',
  chloride: '',
  weather: '',
  notes: '',
  recommendation: '',
};

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function SoilHealth({ db, persist, addActivity }: Props) {
  const soilTests: SoilTestResult[] = db.soilTests || [];
  const sapTests: SapTest[] = db.sapTests || [];

  const [view, setView] = useState<'overview' | 'tests' | 'sap' | 'actions'>('overview');
  const [showSoilModal, setShowSoilModal] = useState(false);
  const [showSapModal, setShowSapModal] = useState(false);
  const [editSoilId, setEditSoilId] = useState<string | null>(null);
  const [editSapId, setEditSapId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string>('');
  const [soilForm, setSoilForm] = useState<Omit<SoilTestResult, 'id'>>(EMPTY_FORM);
  const [sapForm, setSapForm] = useState<SapForm>(EMPTY_SAP_FORM);
  const [filterSource, setFilterSource] = useState<string>('All');

  // Collect all field names from soil tests, sap tests and existing fields
  const allFields = useMemo(() => {
    const fromTests = soilTests.map(t => t.field);
    const fromSap = sapTests.map(t => t.field);
    const fromFields = db.fields.map(f => f.name);
    const seen: Record<string, boolean> = {};
    return [...fromFields, ...fromTests, ...fromSap]
      .filter(Boolean)
      .filter(f => { if (seen[f]) return false; seen[f] = true; return true; })
      .sort();
  }, [db.fields, soilTests, sapTests]);

  const summaries = useMemo(
    () => buildFieldSummaries(allFields, soilTests, sapTests),
    [allFields, soilTests, sapTests]
  );

  const actionFields = summaries.filter(s => s.issues.length > 0);

  // KPIs
  const avgPh = soilTests.length
    ? soilTests.filter(t => t.ph !== undefined).reduce((a, b) => a + (b.ph ?? 0), 0) /
      soilTests.filter(t => t.ph !== undefined).length
    : undefined;

  /* ─── Persist helpers ───────────────────────────────────────────────── */
  function saveSoilTest() {
    if (!soilForm.field || !soilForm.date) return alert('Field and date are required');
    const updated = [...soilTests];
    if (editSoilId) {
      const idx = updated.findIndex(t => t.id === editSoilId);
      if (idx >= 0) updated[idx] = { ...soilForm, id: editSoilId };
    } else {
      updated.push({ ...soilForm, id: uid() });
    }
    persist({ ...db, soilTests: updated });
    addActivity(`${editSoilId ? 'Updated' : 'Added'} soil test: ${soilForm.field} (${soilForm.source})`);
    setShowSoilModal(false);
    setEditSoilId(null);
    setSoilForm(EMPTY_FORM);
  }

  function deleteSoilTest(id: string) {
    if (!confirm('Delete this soil test?')) return;
    persist({ ...db, soilTests: soilTests.filter(t => t.id !== id) });
  }

  function editSoilTest(t: SoilTestResult) {
    setSoilForm({ ...t });
    setEditSoilId(t.id);
    setShowSoilModal(true);
  }

  function saveSapTest() {
    if (!sapForm.field || !sapForm.date) return alert('Field and date are required');
    const readings: SapTestReadings = {
      brixNew: sapForm.brixNew ? parseFloat(sapForm.brixNew) : undefined,
      brixOld: sapForm.brixOld ? parseFloat(sapForm.brixOld) : undefined,
      ph: sapForm.ph ? parseFloat(sapForm.ph) : undefined,
      ec: sapForm.ec ? parseFloat(sapForm.ec) : undefined,
      nitrate: sapForm.nitrate ? parseFloat(sapForm.nitrate) : undefined,
      ammonium: sapForm.ammonium ? parseFloat(sapForm.ammonium) : undefined,
      potassium: sapForm.potassium ? parseFloat(sapForm.potassium) : undefined,
      calcium: sapForm.calcium ? parseFloat(sapForm.calcium) : undefined,
      magnesium: sapForm.magnesium ? parseFloat(sapForm.magnesium) : undefined,
      sodium: sapForm.sodium ? parseFloat(sapForm.sodium) : undefined,
      chloride: sapForm.chloride ? parseFloat(sapForm.chloride) : undefined,
    };
    const entry: SapTest = {
      id: editSapId || uid(),
      date: sapForm.date,
      field: sapForm.field,
      crop: sapForm.crop,
      variety: sapForm.variety || undefined,
      growthStage: sapForm.growthStage || undefined,
      leaf: sapForm.leaf,
      readings,
      weather: sapForm.weather || undefined,
      notes: sapForm.notes || undefined,
      recommendation: sapForm.recommendation || undefined,
      source: 'Nutriscope',
    };
    const updated = editSapId
      ? sapTests.map(t => (t.id === editSapId ? entry : t))
      : [...sapTests, entry];
    persist({ ...db, sapTests: updated });
    addActivity(`${editSapId ? 'Updated' : 'Added'} Nutriscope sap test: ${sapForm.field}`);
    setShowSapModal(false);
    setEditSapId(null);
    setSapForm(EMPTY_SAP_FORM);
  }

  function deleteSapTest(id: string) {
    if (!confirm('Delete this sap test?')) return;
    persist({ ...db, sapTests: sapTests.filter(t => t.id !== id) });
  }

  function editSapTest(t: SapTest) {
    setSapForm({
      date: t.date,
      field: t.field,
      crop: t.crop,
      variety: t.variety || '',
      growthStage: t.growthStage || '',
      leaf: t.leaf as 'new' | 'old' | 'both',
      brixNew: t.readings.brixNew !== undefined ? String(t.readings.brixNew) : '',
      brixOld: t.readings.brixOld !== undefined ? String(t.readings.brixOld) : '',
      ph: t.readings.ph !== undefined ? String(t.readings.ph) : '',
      ec: t.readings.ec !== undefined ? String(t.readings.ec) : '',
      nitrate: t.readings.nitrate !== undefined ? String(t.readings.nitrate) : '',
      ammonium: t.readings.ammonium !== undefined ? String(t.readings.ammonium) : '',
      potassium: t.readings.potassium !== undefined ? String(t.readings.potassium) : '',
      calcium: t.readings.calcium !== undefined ? String(t.readings.calcium) : '',
      magnesium: t.readings.magnesium !== undefined ? String(t.readings.magnesium) : '',
      sodium: t.readings.sodium !== undefined ? String(t.readings.sodium) : '',
      chloride: t.readings.chloride !== undefined ? String(t.readings.chloride) : '',
      weather: t.weather || '',
      notes: t.notes || '',
      recommendation: t.recommendation || '',
    });
    setEditSapId(t.id);
    setShowSapModal(true);
  }

  /* ─── Field profile card ────────────────────────────────────────────── */
  const profileField = selectedField || (allFields.length > 0 ? allFields[0] : '');
  const profileTests = soilTests.filter(t => t.field === profileField).sort((a, b) => b.date.localeCompare(a.date));
  const profileSaps = sapTests.filter(t => t.field === profileField).sort((a, b) => b.date.localeCompare(a.date));
  const profileCrop = db.fields.find(f => f.name === profileField);

  /* ─── Filtered test list ────────────────────────────────────────────── */
  const filteredTests = soilTests
    .filter(t => filterSource === 'All' || t.source === filterSource)
    .sort((a, b) => b.date.localeCompare(a.date));

  /* ─── Number input helper ────────────────────────────────────────────── */
  function numField(
    label: string,
    key: keyof Omit<SoilTestResult, 'id' | 'field' | 'date' | 'source' | 'lab' | 'depth' | 'notes' |
      'recommendation' | 'soilType' | 'texture' | 'soylZone' | 'phosphorusIndex' | 'potassiumIndex' | 'magnesiumIndex'>,
    unit?: string
  ) {
    return (
      <div className="field-row" style={{ flex: '1 1 140px' }}>
        <label className="form-label">{label}{unit ? ` (${unit})` : ''}</label>
        <input
          type="number"
          step="0.01"
          value={soilForm[key] !== undefined ? String(soilForm[key]) : ''}
          onChange={e => setSoilForm({ ...soilForm, [key]: e.target.value ? parseFloat(e.target.value) : undefined })}
          placeholder="—"
        />
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(['overview', 'tests', 'sap', 'actions'] as const).map(v => (
          <button
            key={v}
            className={view === v ? 'btn-primary' : 'btn-add'}
            onClick={() => setView(v)}
          >
            {v === 'overview' ? 'Field overview' : v === 'tests' ? 'Soil tests' : v === 'sap' ? 'Sap tests' : `⚠ Actions (${actionFields.length})`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn-add" onClick={() => { setSoilForm(EMPTY_FORM); setEditSoilId(null); setShowSoilModal(true); }}>+ Soil test</button>
        <button className="btn-add" onClick={() => { setSapForm(EMPTY_SAP_FORM); setEditSapId(null); setShowSapModal(true); }}>+ Sap test</button>
      </div>

      {/* KPI strip */}
      <div className="metric-grid" style={{ marginBottom: '1rem' }}>
        <div className="metric-card">
          <div className="metric-label">Soil tests</div>
          <div className="metric-value">{soilTests.length}</div>
          <div className="metric-sub">{soilTests.map(t => t.field).filter((f, i, a) => a.indexOf(f) === i).length} fields covered</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Sap tests</div>
          <div className="metric-value">{sapTests.length}</div>
          <div className="metric-sub">{sapTests.map(t => t.field).filter((f, i, a) => a.indexOf(f) === i).length} fields</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg farm pH</div>
          <div className="metric-value">{avgPh !== undefined ? avgPh.toFixed(1) : '—'}</div>
          <div className="metric-sub">Target 6.0–7.0</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Fields needing action</div>
          <div className="metric-value" style={{ color: actionFields.length > 0 ? '#912e2e' : undefined }}>
            {actionFields.length}
          </div>
          <div className="metric-sub">deficiency or pH issue</div>
        </div>
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
      {view === 'overview' && (
        <>
          {/* Field selector */}
          {allFields.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0 }}>Field profile:</label>
              <select
                value={profileField}
                onChange={e => setSelectedField(e.target.value)}
                style={{ minWidth: 180 }}
              >
                {allFields.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}

          {profileField ? (
            <>
              {/* Profile header */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-title">
                  {profileField}
                  {profileCrop && (
                    <span style={{ fontWeight: 400, fontSize: 13, color: '#666', marginLeft: 8 }}>
                      · {profileCrop.area.toFixed(1)}ha · {profileCrop.crop || profileCrop.status}
                    </span>
                  )}
                </div>

                {/* Latest soil test summary */}
                {profileTests.length > 0 ? (
                  <>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                      Latest soil test: <strong>{fmtDate(profileTests[0].date)}</strong> · {profileTests[0].source}
                      {profileTests[0].depth ? ` · ${profileTests[0].depth}` : ''}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      {profileTests[0].ph !== undefined && (
                        <span className={`badge ${phColor(profileTests[0].ph)}`}>pH {profileTests[0].ph}</span>
                      )}
                      {(profileTests[0].phosphorus !== undefined || profileTests[0].phosphorusIndex) && (
                        <span className={`badge ${indexColor(profileTests[0].phosphorusIndex)}`}>
                          P {indexLabel(profileTests[0].phosphorus, profileTests[0].phosphorusIndex)}
                        </span>
                      )}
                      {(profileTests[0].potassium !== undefined || profileTests[0].potassiumIndex) && (
                        <span className={`badge ${indexColor(profileTests[0].potassiumIndex)}`}>
                          K {indexLabel(profileTests[0].potassium, profileTests[0].potassiumIndex)}
                        </span>
                      )}
                      {(profileTests[0].magnesium !== undefined || profileTests[0].magnesiumIndex) && (
                        <span className={`badge ${indexColor(profileTests[0].magnesiumIndex)}`}>
                          Mg {indexLabel(profileTests[0].magnesium, profileTests[0].magnesiumIndex)}
                        </span>
                      )}
                      {profileTests[0].organicMatter !== undefined && (
                        <span className={`badge ${omColor(profileTests[0].organicMatter)}`}>
                          OM {profileTests[0].organicMatter}%
                        </span>
                      )}
                      {profileTests[0].organicCarbon !== undefined && (
                        <span className="badge bg-blue">SOC {profileTests[0].organicCarbon}%</span>
                      )}
                      {profileTests[0].nitrogen !== undefined && (
                        <span className="badge bg-blue">N {profileTests[0].nitrogen}</span>
                      )}
                    </div>
                    {profileTests[0].recommendation && (
                      <div style={{ fontSize: 13, color: '#2e7d32', background: '#f0f7ee', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                        💡 {profileTests[0].recommendation}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty">No soil tests recorded for this field yet.</div>
                )}

                {/* Latest sap test */}
                {profileSaps.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 10, marginBottom: 6, borderTop: '1px solid #eee', paddingTop: 8 }}>
                      Latest Nutriscope sap test: <strong>{fmtDate(profileSaps[0].date)}</strong>
                      {profileSaps[0].crop ? ` · ${profileSaps[0].crop}` : ''}
                      {profileSaps[0].growthStage ? ` · ${profileSaps[0].growthStage}` : ''}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {profileSaps[0].readings.brixNew !== undefined && (
                        <span className="badge bg-green">Brix (new) {profileSaps[0].readings.brixNew}</span>
                      )}
                      {profileSaps[0].readings.brixOld !== undefined && (
                        <span className="badge bg-blue">Brix (old) {profileSaps[0].readings.brixOld}</span>
                      )}
                      {profileSaps[0].readings.nitrate !== undefined && (
                        <span className="badge bg-amber">NO₃ {profileSaps[0].readings.nitrate} ppm</span>
                      )}
                      {profileSaps[0].readings.potassium !== undefined && (
                        <span className="badge bg-blue">K {profileSaps[0].readings.potassium} ppm</span>
                      )}
                      {profileSaps[0].readings.calcium !== undefined && (
                        <span className="badge bg-blue">Ca {profileSaps[0].readings.calcium} ppm</span>
                      )}
                    </div>
                    {profileSaps[0].recommendation && (
                      <div style={{ fontSize: 13, color: '#2e7d32', background: '#f0f7ee', borderRadius: 6, padding: '6px 10px', marginTop: 8 }}>
                        💡 {profileSaps[0].recommendation}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Test history for this field */}
              {profileTests.length > 1 && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <div className="card-title">Test history — {profileField}</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                          <th style={{ padding: '4px 8px' }}>Date</th>
                          <th style={{ padding: '4px 8px' }}>Source</th>
                          <th style={{ padding: '4px 8px' }}>pH</th>
                          <th style={{ padding: '4px 8px' }}>P</th>
                          <th style={{ padding: '4px 8px' }}>K</th>
                          <th style={{ padding: '4px 8px' }}>Mg</th>
                          <th style={{ padding: '4px 8px' }}>OM%</th>
                          <th style={{ padding: '4px 8px' }}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileTests.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '4px 8px' }}>{fmtDate(t.date)}</td>
                            <td style={{ padding: '4px 8px' }}><span className={`badge ${sourceColor(t.source)}`}>{t.source}</span></td>
                            <td style={{ padding: '4px 8px' }}>{t.ph ?? '—'}</td>
                            <td style={{ padding: '4px 8px' }}>{t.phosphorusIndex ? `Idx ${t.phosphorusIndex}` : t.phosphorus ?? '—'}</td>
                            <td style={{ padding: '4px 8px' }}>{t.potassiumIndex ? `Idx ${t.potassiumIndex}` : t.potassium ?? '—'}</td>
                            <td style={{ padding: '4px 8px' }}>{t.magnesiumIndex ? `Idx ${t.magnesiumIndex}` : t.magnesium ?? '—'}</td>
                            <td style={{ padding: '4px 8px' }}>{t.organicMatter ?? '—'}</td>
                            <td style={{ padding: '4px 8px', color: '#666' }}>{t.notes || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card">
              <div className="empty">No soil or sap tests recorded yet. Use the buttons above to add your first reading.</div>
            </div>
          )}

          {/* Farm-wide comparison grid */}
          {summaries.filter(s => s.testCount > 0 || s.sapCount > 0).length > 0 && (
            <div className="card">
              <div className="card-title">All fields — soil health at a glance</div>
              {summaries.filter(s => s.testCount > 0 || s.sapCount > 0).map(s => (
                <div
                  key={s.field}
                  className="row-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setSelectedField(s.field); setView('overview'); }}
                >
                  <div style={{ flex: 1 }}>
                    <div className="row-name">
                      {s.field}
                      {s.issues.length > 0 && (
                        <span style={{ marginLeft: 8, color: '#912e2e', fontSize: 12 }}>⚠ {s.issues.join(' · ')}</span>
                      )}
                    </div>
                    <div className="row-sub">
                      {s.testCount > 0 && `${s.testCount} soil test${s.testCount > 1 ? 's' : ''}`}
                      {s.testCount > 0 && s.sapCount > 0 && ' · '}
                      {s.sapCount > 0 && `${s.sapCount} sap test${s.sapCount > 1 ? 's' : ''}`}
                      {s.latestTest && ` · Last tested ${fmtDate(s.latestTest.date)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {s.latestTest?.ph !== undefined && (
                      <span className={`badge ${phColor(s.latestTest.ph)}`}>pH {s.latestTest.ph}</span>
                    )}
                    {s.latestTest?.phosphorusIndex && (
                      <span className={`badge ${indexColor(s.latestTest.phosphorusIndex)}`}>P{s.latestTest.phosphorusIndex}</span>
                    )}
                    {s.latestTest?.potassiumIndex && (
                      <span className={`badge ${indexColor(s.latestTest.potassiumIndex)}`}>K{s.latestTest.potassiumIndex}</span>
                    )}
                    {s.latestTest?.organicMatter !== undefined && (
                      <span className={`badge ${omColor(s.latestTest.organicMatter)}`}>OM {s.latestTest.organicMatter}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── SOIL TESTS LIST ───────────────────────────────────────────────── */}
      {view === 'tests' && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Soil tests
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ fontSize: 13, marginLeft: 'auto' }}>
              <option>All</option>
              <option>Nutriscope</option>
              <option>SOYL</option>
              <option>Independent</option>
              <option>Other</option>
            </select>
          </div>
          {filteredTests.length === 0 ? (
            <div className="empty">No soil tests recorded. Click "+ Soil test" to add one.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>Date</th>
                    <th style={{ padding: '4px 8px' }}>Field</th>
                    <th style={{ padding: '4px 8px' }}>Source</th>
                    <th style={{ padding: '4px 8px' }}>Depth</th>
                    <th style={{ padding: '4px 8px' }}>pH</th>
                    <th style={{ padding: '4px 8px' }}>P</th>
                    <th style={{ padding: '4px 8px' }}>K</th>
                    <th style={{ padding: '4px 8px' }}>Mg</th>
                    <th style={{ padding: '4px 8px' }}>OM%</th>
                    <th style={{ padding: '4px 8px' }}>Notes</th>
                    <th style={{ padding: '4px 8px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                      <td style={{ padding: '4px 8px' }}>{t.field}</td>
                      <td style={{ padding: '4px 8px' }}><span className={`badge ${sourceColor(t.source)}`}>{t.source}</span></td>
                      <td style={{ padding: '4px 8px', color: '#666' }}>{t.depth || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>
                        {t.ph !== undefined ? <span className={`badge ${phColor(t.ph)}`}>{t.ph}</span> : '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {t.phosphorusIndex
                          ? <span className={`badge ${indexColor(t.phosphorusIndex)}`}>Idx {t.phosphorusIndex}</span>
                          : t.phosphorus ?? '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {t.potassiumIndex
                          ? <span className={`badge ${indexColor(t.potassiumIndex)}`}>Idx {t.potassiumIndex}</span>
                          : t.potassium ?? '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {t.magnesiumIndex
                          ? <span className={`badge ${indexColor(t.magnesiumIndex)}`}>Idx {t.magnesiumIndex}</span>
                          : t.magnesium ?? '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>{t.organicMatter ?? '—'}</td>
                      <td style={{ padding: '4px 8px', color: '#666', maxWidth: 200 }}>{t.notes || ''}</td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        <button className="btn-add" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => editSoilTest(t)}>Edit</button>
                        {' '}
                        <button className="del-btn" onClick={() => deleteSoilTest(t.id)}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── SAP TESTS LIST ────────────────────────────────────────────────── */}
      {view === 'sap' && (
        <div className="card">
          <div className="card-title">Nutriscope sap tests</div>
          {sapTests.length === 0 ? (
            <div className="empty">No sap tests recorded. Click "+ Sap test" to add one.</div>
          ) : (
            sapTests.sort((a, b) => b.date.localeCompare(a.date)).map(t => (
              <div key={t.id} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name">
                    {t.field}
                    {t.crop && <span style={{ fontWeight: 400, marginLeft: 6, color: '#666' }}>· {t.crop}</span>}
                    {t.growthStage && <span style={{ fontWeight: 400, marginLeft: 6, color: '#666' }}>· {t.growthStage}</span>}
                  </div>
                  <div className="row-sub">{fmtDate(t.date)}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {t.readings.brixNew !== undefined && <span className="badge bg-green">Brix (new) {t.readings.brixNew}</span>}
                    {t.readings.brixOld !== undefined && <span className="badge bg-blue">Brix (old) {t.readings.brixOld}</span>}
                    {t.readings.ph !== undefined && <span className={`badge ${phColor(t.readings.ph)}`}>pH {t.readings.ph}</span>}
                    {t.readings.ec !== undefined && <span className="badge bg-blue">EC {t.readings.ec}</span>}
                    {t.readings.nitrate !== undefined && <span className="badge bg-amber">NO₃ {t.readings.nitrate} ppm</span>}
                    {t.readings.ammonium !== undefined && <span className="badge bg-amber">NH₄ {t.readings.ammonium} ppm</span>}
                    {t.readings.potassium !== undefined && <span className="badge bg-blue">K {t.readings.potassium} ppm</span>}
                    {t.readings.calcium !== undefined && <span className="badge bg-blue">Ca {t.readings.calcium} ppm</span>}
                    {t.readings.magnesium !== undefined && <span className="badge bg-blue">Mg {t.readings.magnesium} ppm</span>}
                  </div>
                  {t.recommendation && (
                    <div style={{ fontSize: 13, color: '#2e7d32', background: '#f0f7ee', borderRadius: 6, padding: '5px 10px', marginTop: 6 }}>
                      💡 {t.recommendation}
                    </div>
                  )}
                  {t.notes && <div className="row-sub" style={{ marginTop: 4 }}>{t.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-add" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => editSapTest(t)}>Edit</button>
                  <button className="del-btn" onClick={() => deleteSapTest(t.id)}>×</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── ACTIONS ───────────────────────────────────────────────────────── */}
      {view === 'actions' && (
        <div className="card">
          <div className="card-title">Fields requiring action</div>
          {actionFields.length === 0 ? (
            <div className="empty">No deficiencies or pH issues flagged from current test data.</div>
          ) : (
            actionFields.sort((a, b) => b.issues.length - a.issues.length).map(s => (
              <div key={s.field} className="row-item" style={{ cursor: 'pointer' }} onClick={() => { setSelectedField(s.field); setView('overview'); }}>
                <div style={{ flex: 1 }}>
                  <div className="row-name">{s.field}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {s.issues.map((issue, i) => <span key={i} className="badge bg-red">{issue}</span>)}
                  </div>
                  {s.latestTest?.recommendation && (
                    <div style={{ fontSize: 13, color: '#2e7d32', background: '#f0f7ee', borderRadius: 6, padding: '5px 10px', marginTop: 6 }}>
                      💡 {s.latestTest.recommendation}
                    </div>
                  )}
                  <div className="row-sub" style={{ marginTop: 4 }}>
                    Last tested {fmtDate(s.latestTest?.date)} · {s.latestTest?.source}
                    {s.latestTest?.depth ? ` · ${s.latestTest.depth}` : ''}
                  </div>
                </div>
              </div>
            ))
          )}
          {actionFields.length > 0 && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 12, paddingTop: 8, borderTop: '1px solid #eee' }}>
              Actions flagged where: pH &lt;6.0 or &gt;7.5 · P/K/Mg Index 0 or 1 · Organic matter &lt;2.5%
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SOIL TEST MODAL                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showSoilModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setShowSoilModal(false)}>
          <div className="modal-box" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">{editSoilId ? 'Edit' : 'Add'} soil test</div>

            {/* Row 1 — field / date / source */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="field-row" style={{ flex: '2 1 200px' }}>
                <label className="form-label">Field *</label>
                <input
                  type="text"
                  list="soil-fields"
                  value={soilForm.field}
                  onChange={e => setSoilForm({ ...soilForm, field: e.target.value })}
                  placeholder="Field name"
                />
                <datalist id="soil-fields">
                  {db.fields.map(f => <option key={f.name} value={f.name} />)}
                </datalist>
              </div>
              <div className="field-row" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Date *</label>
                <input type="date" value={soilForm.date} onChange={e => setSoilForm({ ...soilForm, date: e.target.value })} />
              </div>
              <div className="field-row" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Source</label>
                <select value={soilForm.source} onChange={e => setSoilForm({ ...soilForm, source: e.target.value as any })}>
                  <option>Nutriscope</option>
                  <option>SOYL</option>
                  <option>Independent</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            {/* Row 2 — lab / depth / soil type */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="field-row" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Lab / contractor</label>
                <input type="text" value={soilForm.lab || ''} onChange={e => setSoilForm({ ...soilForm, lab: e.target.value })} placeholder="e.g. NRM" />
              </div>
              <div className="field-row" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Sample depth</label>
                <input type="text" value={soilForm.depth || ''} onChange={e => setSoilForm({ ...soilForm, depth: e.target.value })} placeholder="0-15cm" />
              </div>
              <div className="field-row" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Soil type</label>
                <input type="text" value={soilForm.soilType || ''} onChange={e => setSoilForm({ ...soilForm, soilType: e.target.value })} placeholder="Sandy loam…" />
              </div>
            </div>

            {/* Row 3 — pH, OM, SOC, N */}
            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', margin: '8px 0 4px' }}>Physical & organic</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {numField('pH', 'ph')}
              {numField('Organic matter', 'organicMatter', '%')}
              {numField('Organic carbon', 'organicCarbon', '%')}
              {numField('Mineral N', 'nitrogen', 'kg/ha')}
              {numField('Sulphur', 'sulphur', 'mg/kg')}
            </div>

            {/* Row 4 — P, K, Mg with index dropdowns */}
            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', margin: '8px 0 4px' }}>Macronutrients (P, K, Mg)</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="field-row" style={{ flex: '1 1 120px' }}>
                <label className="form-label">P (mg/l)</label>
                <input type="number" step="0.1" value={soilForm.phosphorus !== undefined ? soilForm.phosphorus : ''} onChange={e => setSoilForm({ ...soilForm, phosphorus: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="—" />
              </div>
              <div className="field-row" style={{ flex: '1 1 80px' }}>
                <label className="form-label">P Index</label>
                <select value={soilForm.phosphorusIndex || ''} onChange={e => setSoilForm({ ...soilForm, phosphorusIndex: e.target.value })}>
                  <option value="">—</option>
                  <option>0</option><option>1</option><option>2</option><option>3</option><option>4</option>
                </select>
              </div>
              <div className="field-row" style={{ flex: '1 1 120px' }}>
                <label className="form-label">K (mg/l)</label>
                <input type="number" step="0.1" value={soilForm.potassium !== undefined ? soilForm.potassium : ''} onChange={e => setSoilForm({ ...soilForm, potassium: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="—" />
              </div>
              <div className="field-row" style={{ flex: '1 1 80px' }}>
                <label className="form-label">K Index</label>
                <select value={soilForm.potassiumIndex || ''} onChange={e => setSoilForm({ ...soilForm, potassiumIndex: e.target.value })}>
                  <option value="">—</option>
                  <option>0</option><option>1</option><option>2</option><option>3</option><option>4</option>
                </select>
              </div>
              <div className="field-row" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Mg (mg/l)</label>
                <input type="number" step="0.1" value={soilForm.magnesium !== undefined ? soilForm.magnesium : ''} onChange={e => setSoilForm({ ...soilForm, magnesium: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="—" />
              </div>
              <div className="field-row" style={{ flex: '1 1 80px' }}>
                <label className="form-label">Mg Index</label>
                <select value={soilForm.magnesiumIndex || ''} onChange={e => setSoilForm({ ...soilForm, magnesiumIndex: e.target.value })}>
                  <option value="">—</option>
                  <option>0</option><option>1</option><option>2</option><option>3</option><option>4</option>
                </select>
              </div>
            </div>

            {/* Row 5 — trace elements */}
            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', margin: '8px 0 4px' }}>Trace elements (mg/kg)</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {numField('Boron', 'boron')}
              {numField('Manganese', 'manganese')}
              {numField('Zinc', 'zinc')}
              {numField('Copper', 'copper')}
            </div>

            {/* SOYL-specific */}
            {soilForm.source === 'SOYL' && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#666', margin: '8px 0 4px' }}>SOYL variable-rate recommendations</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div className="field-row" style={{ flex: '1 1 120px' }}>
                    <label className="form-label">Management zone</label>
                    <input type="text" value={soilForm.soylZone || ''} onChange={e => setSoilForm({ ...soilForm, soylZone: e.target.value })} placeholder="Zone A…" />
                  </div>
                  {numField('VR N rate', 'vrNRate', 'kg/ha')}
                  {numField('VR P rate', 'vrPRate', 'kg/ha')}
                  {numField('VR K rate', 'vrKRate', 'kg/ha')}
                </div>
              </>
            )}

            {/* Notes & recommendation */}
            <div className="field-row">
              <label className="form-label">Recommendation / action</label>
              <textarea value={soilForm.recommendation || ''} onChange={e => setSoilForm({ ...soilForm, recommendation: e.target.value })} placeholder="e.g. Apply 2t/ha lime before drilling" style={{ minHeight: 50 }} />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={soilForm.notes || ''} onChange={e => setSoilForm({ ...soilForm, notes: e.target.value })} placeholder="Any additional context" style={{ minHeight: 50 }} />
            </div>

            <div className="modal-btns">
              <button className="btn-primary" onClick={saveSoilTest}>Save</button>
              <button className="btn-cancel" onClick={() => { setShowSoilModal(false); setEditSoilId(null); setSoilForm(EMPTY_FORM); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SAP TEST MODAL                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showSapModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setShowSapModal(false)}>
          <div className="modal-box" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">{editSapId ? 'Edit' : 'Add'} Nutriscope sap test</div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="field-row" style={{ flex: '2 1 180px' }}>
                <label className="form-label">Field *</label>
                <input
                  type="text"
                  list="sap-fields"
                  value={sapForm.field}
                  onChange={e => setSapForm({ ...sapForm, field: e.target.value })}
                  placeholder="Field name"
                />
                <datalist id="sap-fields">
                  {db.fields.map(f => <option key={f.name} value={f.name} />)}
                </datalist>
              </div>
              <div className="field-row" style={{ flex: '1 1 130px' }}>
                <label className="form-label">Date *</label>
                <input type="date" value={sapForm.date} onChange={e => setSapForm({ ...sapForm, date: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="field-row" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Crop</label>
                <input type="text" value={sapForm.crop} onChange={e => setSapForm({ ...sapForm, crop: e.target.value })} placeholder="Winter wheat…" />
              </div>
              <div className="field-row" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Variety</label>
                <input type="text" value={sapForm.variety} onChange={e => setSapForm({ ...sapForm, variety: e.target.value })} placeholder="Skyscraper…" />
              </div>
              <div className="field-row" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Growth stage</label>
                <input type="text" value={sapForm.growthStage} onChange={e => setSapForm({ ...sapForm, growthStage: e.target.value })} placeholder="GS30…" />
              </div>
              <div className="field-row" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Leaf sampled</label>
                <select value={sapForm.leaf} onChange={e => setSapForm({ ...sapForm, leaf: e.target.value as any })}>
                  <option value="both">Both</option>
                  <option value="new">New leaf</option>
                  <option value="old">Old leaf</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', margin: '8px 0 4px' }}>Readings</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(['brixNew', 'brixOld', 'ph', 'ec'] as const).map(k => (
                <div key={k} className="field-row" style={{ flex: '1 1 100px' }}>
                  <label className="form-label">{k === 'brixNew' ? 'Brix (new)' : k === 'brixOld' ? 'Brix (old)' : k === 'ph' ? 'pH' : 'EC (mS/cm)'}</label>
                  <input type="number" step="0.01" value={(sapForm as any)[k]} onChange={e => setSapForm({ ...sapForm, [k]: e.target.value })} placeholder="—" />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {([
                ['nitrate', 'Nitrate (ppm)'],
                ['ammonium', 'Ammonium (ppm)'],
                ['potassium', 'Potassium (ppm)'],
                ['calcium', 'Calcium (ppm)'],
                ['magnesium', 'Magnesium (ppm)'],
                ['sodium', 'Sodium (ppm)'],
                ['chloride', 'Chloride (ppm)'],
              ] as [string, string][]).map(([k, label]) => (
                <div key={k} className="field-row" style={{ flex: '1 1 120px' }}>
                  <label className="form-label">{label}</label>
                  <input type="number" step="0.1" value={(sapForm as any)[k]} onChange={e => setSapForm({ ...sapForm, [k]: e.target.value })} placeholder="—" />
                </div>
              ))}
            </div>

            <div className="field-row">
              <label className="form-label">Weather / conditions at sampling</label>
              <input type="text" value={sapForm.weather} onChange={e => setSapForm({ ...sapForm, weather: e.target.value })} placeholder="Dry, 14°C…" />
            </div>
            <div className="field-row">
              <label className="form-label">Recommendation</label>
              <textarea value={sapForm.recommendation} onChange={e => setSapForm({ ...sapForm, recommendation: e.target.value })} placeholder="e.g. Apply foliar Ca — Ca:K ratio low" style={{ minHeight: 50 }} />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={sapForm.notes} onChange={e => setSapForm({ ...sapForm, notes: e.target.value })} placeholder="Any additional context" style={{ minHeight: 50 }} />
            </div>

            <div className="modal-btns">
              <button className="btn-primary" onClick={saveSapTest}>Save</button>
              <button className="btn-cancel" onClick={() => { setShowSapModal(false); setEditSapId(null); setSapForm(EMPTY_SAP_FORM); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
