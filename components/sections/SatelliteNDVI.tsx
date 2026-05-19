'use client';

/**
 * Satellite NDVI viewer — Upper Assendon Farm
 *
 * Shows Sentinel-2 NDVI time series per field, year-on-year comparison,
 * and a correlation table once yield data is added.
 *
 * Data flows:
 *   - Snapshots stored in Supabase satellite_ndvi table
 *   - Fetched client-side via /api/satellite/sync (GET)
 *   - Sync triggered via POST to /api/satellite/sync
 */

import { useState, useEffect, useMemo } from 'react';
import { FarmData } from '@/lib/types';

interface Props { db: FarmData; }

interface NdviRow {
  id: string;
  field_name: string;
  rpa_parcel: string;
  capture_date: string;
  crop_year: string;
  crop: string;
  variety: string;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  ndvi_std: number;
  cloud_cover_pct: number;
  growth_stage: string;
  source: string;
  notes?: string;
}

const NDVI_COLOURS = [
  '#c84b31', // 0.0–0.2 bare soil / stressed
  '#e8a838', // 0.2–0.4 sparse / establishment
  '#d4c823', // 0.4–0.5 moderate
  '#8bc34a', // 0.5–0.6 good
  '#4caf50', // 0.6–0.7 very good
  '#1b5e20', // 0.7–1.0 excellent
];

function ndviColor(val: number): string {
  if (val < 0.2) return NDVI_COLOURS[0];
  if (val < 0.4) return NDVI_COLOURS[1];
  if (val < 0.5) return NDVI_COLOURS[2];
  if (val < 0.6) return NDVI_COLOURS[3];
  if (val < 0.7) return NDVI_COLOURS[4];
  return NDVI_COLOURS[5];
}

function ndviLabel(val: number): string {
  if (val < 0.2) return 'Poor';
  if (val < 0.4) return 'Low';
  if (val < 0.5) return 'Fair';
  if (val < 0.6) return 'Good';
  if (val < 0.7) return 'Very good';
  return 'Excellent';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

const CROP_YEARS = ['2025/26', '2024/25', '2023/24', '2022/23'];

// Simple sparkline drawn with SVG
function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastVal = values[values.length - 1];
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={ndviColor(lastVal)} strokeWidth={1.5} />
      <circle
        cx={((values.length - 1) / (values.length - 1)) * width}
        cy={height - ((lastVal - min) / range) * height}
        r={2.5} fill={ndviColor(lastVal)} />
    </svg>
  );
}

export default function SatelliteNDVI({ db }: Props) {
  const [rows, setRows] = useState<NdviRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState('2025/26');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'timeline' | 'compare'>('grid');
  const [error, setError] = useState<string | null>(null);

  // Load data from Supabase via API
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cropYear: selectedYear, limit: '1000' });
      const res = await fetch(`/api/satellite/sync?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json() as { data?: NdviRow[]; error?: string };
      if (json.error) throw new Error(json.error);
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Trigger satellite sync — runs batches sequentially to avoid timeout
  async function triggerSync() {
    setSyncing(true);
    setSyncResult(null);
    let totalStored = 0;
    let totalErrors = 0;
    let firstErrorMsg = '';
    try {
      let batch = 0;
      let hasMore = true;
      while (hasMore) {
        setSyncResult(`⏳ Syncing batch ${batch + 1}…`);
        const res = await fetch(`/api/satellite/sync?batch=${batch}`, { method: 'POST' });
        const text = await res.text();
        type BatchJson = { snapshotsStored?: number; errors?: number; hasMore?: boolean; totalBatches?: number; error?: string; results?: Array<{ field: string; error?: string }> };
        let json: BatchJson;
        try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 200)}`); }
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
        totalStored += json.snapshotsStored ?? 0;
        totalErrors += json.errors ?? 0;
        if (!firstErrorMsg) {
          const firstErr = json.results?.find(r => r.error);
          if (firstErr) firstErrorMsg = `${firstErr.field}: ${firstErr.error}`;
        }
        hasMore = json.hasMore ?? false;
        batch++;
      }
      const detail = firstErrorMsg ? ` — Sample error: ${firstErrorMsg}` : '';
      setSyncResult(`✅ Sync complete: ${totalStored} snapshots stored. Errors: ${totalErrors}${detail}`);
      await loadData();
    } catch (e) {
      setSyncResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedYear]);

  // Derived: latest NDVI per field
  const fieldSummaries = useMemo(() => {
    const byField = new Map<string, NdviRow[]>();
    for (const r of rows) {
      if (!byField.has(r.field_name)) byField.set(r.field_name, []);
      byField.get(r.field_name)!.push(r);
    }
    return Array.from(byField.entries()).map(([name, records]) => {
      const sorted = [...records].sort((a, b) => a.capture_date.localeCompare(b.capture_date));
      const latest = sorted[sorted.length - 1];
      const peak = sorted.reduce((a, b) => b.ndvi_mean > a.ndvi_mean ? b : a, sorted[0]);
      return { name, records: sorted, latest, peak, count: sorted.length };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Selected field records
  const fieldRecords = useMemo(() => {
    if (!selectedField) return [];
    return rows
      .filter(r => r.field_name === selectedField)
      .sort((a, b) => a.capture_date.localeCompare(b.capture_date));
  }, [rows, selectedField]);

  // All arable fields from db for cross-reference
  const arableFields = useMemo(() =>
    db.fields.filter(f => f.status === 'In crop' || f.status === 'Active'),
    [db.fields]
  );

  const cardStyle: React.CSSProperties = { background: 'var(--color-card)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--color-border)' };

  return (
    <div className="section-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Satellite Crop Monitoring</h2>
          <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>Sentinel-2 NDVI · 10m resolution · 5-day revisit</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 }}>
            {CROP_YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {(['grid', 'timeline', 'compare'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '6px 10px', fontSize: 12, border: 'none', cursor: 'pointer', background: view === v ? 'var(--color-primary)' : 'var(--color-surface)', color: view === v ? '#fff' : 'var(--color-text)', textTransform: 'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={triggerSync} disabled={syncing} style={{ fontSize: 12 }}>
            {syncing ? '⏳ Syncing…' : '🛰 Sync now'}
          </button>
        </div>
      </div>

      {/* Setup notice — shown when no Copernicus credentials are configured */}
      {rows.length === 0 && !loading && (
        <div style={{ ...cardStyle, borderLeft: '4px solid var(--color-warning)', marginBottom: 16, background: 'var(--color-surface)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>⚙️ Setup required — free Copernicus account</div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6 }}>
            To fetch satellite imagery, add two environment variables to your Vercel project:<br />
            <code style={{ background: 'var(--color-border)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>COPERNICUS_CLIENT_ID</code> and{' '}
            <code style={{ background: 'var(--color-border)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>COPERNICUS_CLIENT_SECRET</code><br /><br />
            Register free (2 minutes) at{' '}
            <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
              dataspace.copernicus.eu
            </a>{' '}→ Identity → OAuth clients → Create client.
            Then paste the credentials into Vercel → Settings → Environment Variables.
          </div>
        </div>
      )}

      {syncResult && (
        <div style={{ ...cardStyle, marginBottom: 12, fontSize: 13, color: syncResult.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {syncResult}
        </div>
      )}

      {error && (
        <div style={{ ...cardStyle, marginBottom: 12, fontSize: 13, color: 'var(--color-danger)' }}>{error}</div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)', fontSize: 13 }}>Loading satellite data…</div>
      )}

      {!loading && view === 'grid' && (
        <>
          {/* Summary stats */}
          {fieldSummaries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Fields tracked', val: String(fieldSummaries.length) },
                { label: 'Total snapshots', val: String(rows.length) },
                { label: 'Latest capture', val: rows.length > 0 ? fmtDate(rows.reduce((a, b) => b.capture_date > a.capture_date ? b : a).capture_date) : '—' },
                { label: 'Avg NDVI (latest)', val: fieldSummaries.length > 0 ? (fieldSummaries.reduce((s, f) => s + (f.latest?.ndvi_mean ?? 0), 0) / fieldSummaries.length).toFixed(3) : '—' },
              ].map(k => (
                <div key={k.label} style={{ ...cardStyle, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{k.val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Field cards grid */}
          {fieldSummaries.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: 'var(--color-muted)', fontSize: 13 }}>
              No satellite data yet for {selectedYear}. Click "Sync now" to fetch Sentinel-2 imagery for all your fields.
              <br /><br />
              <span style={{ fontSize: 12 }}>First sync pulls the last 90 days. Subsequent syncs fetch only new captures.</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {fieldSummaries.map(f => (
                <div key={f.name} style={{ ...cardStyle, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onClick={() => { setSelectedField(f.name); setView('timeline'); }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</div>
                    {f.latest && (
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 10, background: ndviColor(f.latest.ndvi_mean) + '33', color: ndviColor(f.latest.ndvi_mean), fontWeight: 700 }}>
                        {ndviLabel(f.latest.ndvi_mean)}
                      </span>
                    )}
                  </div>
                  {f.latest && (
                    <div style={{ fontSize: 22, fontWeight: 700, color: ndviColor(f.latest.ndvi_mean), marginBottom: 2 }}>
                      {f.latest.ndvi_mean.toFixed(3)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 8 }}>
                    {f.latest ? `${f.latest.growth_stage} · ${fmtDate(f.latest.capture_date)}` : 'No data'}
                  </div>
                  <Sparkline values={f.records.map(r => r.ndvi_mean)} />
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 6 }}>
                    {f.count} captures · Peak {f.peak?.ndvi_mean.toFixed(3) ?? '—'} ({f.peak ? fmtDate(f.peak.capture_date) : '—'})
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Untracked arable fields */}
          {arableFields.length > 0 && fieldSummaries.length < arableFields.length && (
            <div style={{ ...cardStyle, marginTop: 12, fontSize: 13, color: 'var(--color-muted)' }}>
              <span style={{ fontWeight: 500 }}>Not yet tracked:</span>{' '}
              {arableFields
                .filter(f => !fieldSummaries.find(s => s.name === f.name))
                .map(f => f.name)
                .join(', ')}
              {' '}— these fields lack RPA parcel references or no cloud-free imagery was available.
            </div>
          )}
        </>
      )}

      {!loading && view === 'timeline' && (
        <div>
          {/* Field selector */}
          <div style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Field:</span>
            <select value={selectedField ?? ''} onChange={e => setSelectedField(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 }}>
              <option value="">— select field —</option>
              {fieldSummaries.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setView('grid')}>← Back to grid</button>
          </div>

          {selectedField && fieldRecords.length > 0 ? (
            <>
              {/* NDVI chart (simple SVG bar chart) */}
              <div style={{ ...cardStyle, marginBottom: 14, overflowX: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 10 }}>
                  NDVI over time — {selectedField} · {selectedYear}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, minWidth: fieldRecords.length * 30 }}>
                  {fieldRecords.map(r => (
                    <div key={r.capture_date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 0 24px' }}
                      title={`${fmtDate(r.capture_date)}\nNDVI: ${r.ndvi_mean.toFixed(3)}\n${r.growth_stage}`}>
                      <div style={{ fontSize: 9, color: 'var(--color-muted)', marginBottom: 2 }}>{r.ndvi_mean.toFixed(2)}</div>
                      <div style={{
                        width: '100%', background: ndviColor(r.ndvi_mean),
                        height: `${Math.round(r.ndvi_mean * 90)}px`,
                        borderRadius: '3px 3px 0 0', minHeight: 4,
                        opacity: r.cloud_cover_pct > 20 ? 0.6 : 1,
                      }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, minWidth: fieldRecords.length * 30, overflowX: 'auto' }}>
                  {fieldRecords.map(r => (
                    <div key={r.capture_date} style={{ flex: '1 0 24px', fontSize: 9, color: 'var(--color-muted)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {new Date(r.capture_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div style={{ ...cardStyle, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['Date', 'Growth stage', 'NDVI mean', 'Min', 'Max', 'Std dev', 'Cloud %', 'Rating'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fieldRecords.map(r => (
                      <tr key={r.capture_date} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{fmtDate(r.capture_date)}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--color-muted)', fontSize: 12 }}>{r.growth_stage}</td>
                        <td style={{ padding: '7px 8px', fontWeight: 700, color: ndviColor(r.ndvi_mean) }}>{r.ndvi_mean.toFixed(4)}</td>
                        <td style={{ padding: '7px 8px', fontSize: 12 }}>{r.ndvi_min.toFixed(4)}</td>
                        <td style={{ padding: '7px 8px', fontSize: 12 }}>{r.ndvi_max.toFixed(4)}</td>
                        <td style={{ padding: '7px 8px', fontSize: 12 }}>{r.ndvi_std.toFixed(4)}</td>
                        <td style={{ padding: '7px 8px', fontSize: 12, color: r.cloud_cover_pct > 25 ? 'var(--color-warning)' : 'var(--color-muted)' }}>
                          {r.cloud_cover_pct.toFixed(0)}%
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: ndviColor(r.ndvi_mean) + '33', color: ndviColor(r.ndvi_mean), fontWeight: 600 }}>
                            {ndviLabel(r.ndvi_mean)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 30, color: 'var(--color-muted)', fontSize: 13 }}>
              {selectedField ? 'No data for this field in the selected year.' : 'Select a field above to see its NDVI timeline.'}
            </div>
          )}
        </div>
      )}

      {!loading && view === 'compare' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 14, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>Year-on-year comparison</div>
            Year-on-year comparison will become useful once you have two or more seasons of data.
            Each year synced adds to the picture — NDVI at T1 in a wet year vs a dry year (like 2026),
            peak canopy before ear emergence, green area index at grain fill.
            Over 3–4 seasons these patterns will start to predict yield potential by field.
          </div>

          {/* Cross-year summary table — shows peak NDVI per field across all years */}
          {rows.length > 0 ? (
            <div style={{ ...cardStyle, overflowX: 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 10 }}>Peak NDVI by field and year</div>
              <CrossYearTable rows={rows} />
            </div>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 30, color: 'var(--color-muted)', fontSize: 13 }}>
              No data yet. Sync satellite data to start building the multi-year picture.
            </div>
          )}
        </div>
      )}

      {/* NDVI legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>NDVI:</span>
        {[
          { label: '< 0.2 Poor', col: NDVI_COLOURS[0] },
          { label: '0.2–0.4 Low', col: NDVI_COLOURS[1] },
          { label: '0.4–0.5 Fair', col: NDVI_COLOURS[2] },
          { label: '0.5–0.6 Good', col: NDVI_COLOURS[3] },
          { label: '0.6–0.7 Very good', col: NDVI_COLOURS[4] },
          { label: '> 0.7 Excellent', col: NDVI_COLOURS[5] },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.col }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cross-year peak NDVI table ────────────────────────────────────────────────
function CrossYearTable({ rows }: { rows: NdviRow[] }) {
  const years = Array.from(new Set(rows.map(r => r.crop_year))).sort().reverse();
  const fields = Array.from(new Set(rows.map(r => r.field_name))).sort();

  // Peak NDVI per field+year
  const peaks: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!peaks[r.field_name]) peaks[r.field_name] = {};
    if (!peaks[r.field_name][r.crop_year] || r.ndvi_mean > peaks[r.field_name][r.crop_year]) {
      peaks[r.field_name][r.crop_year] = r.ndvi_mean;
    }
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500, fontSize: 11 }}>Field</th>
          {years.map(y => (
            <th key={y} style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--color-muted)', fontWeight: 500, fontSize: 11 }}>{y}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fields.map(f => (
          <tr key={f} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={{ padding: '7px 8px', fontWeight: 500 }}>{f}</td>
            {years.map(y => {
              const val = peaks[f]?.[y];
              return (
                <td key={y} style={{ padding: '7px 8px', textAlign: 'center' }}>
                  {val !== undefined ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: ndviColor(val) }}>{val.toFixed(3)}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--color-border)' }}>—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
