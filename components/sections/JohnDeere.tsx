'use client';

import { useMemo, useState } from 'react';
import { FarmData, JdOperation } from '@/lib/types';
import { buildAssuranceImport } from '@/lib/jdAssurance';

interface Props {
  db: FarmData;
  persist: (newDb: FarmData) => void;
}

// Translate Deere's internal crop codes to plain English.
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

function prettyCrop(code?: string) {
  if (!code) return '';
  return CROP_NAMES[code] || code.replace(/_/g, ' ').toLowerCase();
}

const TYPE_LABEL: Record<string, string> = {
  seeding: 'Drilling',
  harvest: 'Harvest',
  application: 'Application',
  tillage: 'Cultivation',
};

const TYPE_COLOUR: Record<string, string> = {
  seeding: '#2e7d32',
  harvest: '#b58900',
  application: '#1565c0',
  tillage: '#6d4c41',
};

function fmtDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function describeOp(op: JdOperation): string {
  if (op.type === 'seeding') {
    const variety = op.varieties?.[0];
    return [prettyCrop(op.cropName), variety && `— ${variety}`].filter(Boolean).join(' ');
  }
  if (op.type === 'harvest') {
    const variety = op.varieties?.[0];
    const machine = op.machineType ? ` (${op.machineType})` : '';
    return [prettyCrop(op.cropName) || 'Harvest', variety && `— ${variety}`]
      .filter(Boolean)
      .join(' ') + machine;
  }
  if (op.type === 'application') {
    if (!op.products || !op.products.length) return 'Application';
    return op.products.map((p) => p.name).join(' + ');
  }
  if (op.type === 'tillage') {
    return op.tillageType || 'Cultivation';
  }
  return op.type;
}

export default function JohnDeere({ db }: Props) {
  const ops = db.jdOperations || [];
  const sync = db.jdSyncStatus;

  const [filterField, setFilterField] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterSeason, setFilterSeason] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string>('');

  const fieldNames = useMemo(() => {
    const set = new Set<string>();
    for (const op of ops) set.add(op.fieldName);
    return Array.from(set).sort();
  }, [ops]);

  const seasons = useMemo(() => {
    const set = new Set<string>();
    for (const op of ops) if (op.cropSeason) set.add(op.cropSeason);
    return Array.from(set).sort().reverse();
  }, [ops]);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const op of ops) set.add(op.type);
    return Array.from(set).sort();
  }, [ops]);

  const filtered = useMemo(() => {
    return ops.filter((o) => {
      if (filterField && o.fieldName !== filterField) return false;
      if (filterType && o.type !== filterType) return false;
      if (filterSeason && o.cropSeason !== filterSeason) return false;
      return true;
    });
  }, [ops, filterField, filterType, filterSeason]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const fieldsTouched = new Set<string>();
    for (const op of filtered) {
      byType[op.type] = (byType[op.type] || 0) + 1;
      fieldsTouched.add(op.fieldName);
    }
    return { byType, fieldsCount: fieldsTouched.size, total: filtered.length };
  }, [filtered]);

  // Build the import preview for Farm Assurance — what could land in the
  // Sprays / Fertilisers logs from the JD applications, after deduping
  // anything we've already imported.
  const importPlan = useMemo(
    () =>
      buildAssuranceImport({
        jdOps: ops,
        hubFields: db.fields || [],
        existingSprays: db.sprays || [],
        existingFertilisers: db.fertilisers || [],
      }),
    [ops, db.fields, db.sprays, db.fertilisers]
  );

  const [importMsg, setImportMsg] = useState<string>('');

  function runImport() {
    if (importPlan.newSprays.length === 0 && importPlan.newFertilisers.length === 0) {
      setImportMsg('Nothing to import — JD applications are already reflected in your records.');
      return;
    }
    const msg = `Import ${importPlan.newSprays.length} spray${
      importPlan.newSprays.length === 1 ? '' : 's'
    } and ${importPlan.newFertilisers.length} fertiliser${
      importPlan.newFertilisers.length === 1 ? '' : 's'
    } into the Hub? Existing records won't be touched; rate/area/operator left blank for you to fill.`;
    if (!confirm(msg)) return;
    persist({
      ...db,
      sprays: [...(db.sprays || []), ...importPlan.newSprays],
      fertilisers: [...(db.fertilisers || []), ...importPlan.newFertilisers],
    });
    setImportMsg(
      `Imported ${importPlan.newSprays.length} sprays and ${importPlan.newFertilisers.length} fertilisers. Visit Compliance to review.`
    );
  }

  async function runSync() {
    setBusy(true);
    setSyncMsg('Syncing — this can take up to a minute…');
    try {
      const res = await fetch('/api/jd/sync-write', { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setSyncMsg(`Sync failed: ${body.error || res.statusText}`);
      } else {
        setSyncMsg(
          `Synced ${body.operationsWritten} operations across ${body.fieldsWithOps} fields. Refresh the page to see them.`
        );
      }
    } catch (e) {
      setSyncMsg(`Sync error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>John Deere Operations</h2>

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          {sync ? (
            <>
              <strong>Last sync:</strong> {fmtDate(sync.syncedAt)} —{' '}
              {sync.operationsTotal} operations across {sync.fieldsTouched} fields, since {sync.since}
            </>
          ) : (
            <em>Not yet synced.</em>
          )}
        </div>
        <button
          onClick={runSync}
          disabled={busy}
          className="btn"
          style={{ marginLeft: 'auto' }}
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {syncMsg && (
        <div style={{ marginBottom: 16, padding: 8, background: '#f5f5f5', borderLeft: '3px solid #888' }}>
          {syncMsg}
        </div>
      )}

      {ops.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            border: '1px solid #d0e3f0',
            borderRadius: 6,
            background: '#f4f9fd',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>Farm Assurance import</strong>
            <span style={{ color: '#555', fontSize: 13 }}>
              {importPlan.newSprays.length} spray{importPlan.newSprays.length === 1 ? '' : 's'} and{' '}
              {importPlan.newFertilisers.length} fertiliser
              {importPlan.newFertilisers.length === 1 ? '' : 's'} ready to add to your records.
              {importPlan.skipped.duplicate > 0 && (
                <> Skipping {importPlan.skipped.duplicate} already imported.</>
              )}
              {importPlan.skipped.unmatchedField > 0 && (
                <> {importPlan.skipped.unmatchedField} ops on JD fields with no Hub match.</>
              )}
            </span>
            <button
              onClick={runImport}
              className="btn"
              disabled={
                importPlan.newSprays.length === 0 && importPlan.newFertilisers.length === 0
              }
              style={{ marginLeft: 'auto' }}
            >
              Import to Hub
            </button>
          </div>
          {importMsg && (
            <div style={{ marginTop: 8, padding: 6, background: '#fff', fontSize: 13 }}>
              {importMsg}
            </div>
          )}
          {importPlan.unmatchedJdFields.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
              <summary style={{ cursor: 'pointer' }}>
                JD fields with applications but no Hub match (
                {importPlan.unmatchedJdFields.length})
              </summary>
              <div style={{ padding: 6 }}>{importPlan.unmatchedJdFields.join(', ')}</div>
            </details>
          )}
        </div>
      )}

      {ops.length === 0 ? (
        <p>
          No operations stored yet. Click <strong>Sync now</strong> to pull from John Deere, or visit{' '}
          <code>/api/jd/sync-write</code> directly.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label>
              Field:&nbsp;
              <select value={filterField} onChange={(e) => setFilterField(e.target.value)}>
                <option value="">All ({fieldNames.length})</option>
                {fieldNames.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              Type:&nbsp;
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All</option>
                {types.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>
                ))}
              </select>
            </label>
            <label>
              Season:&nbsp;
              <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}>
                <option value="">All</option>
                {seasons.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <span style={{ marginLeft: 'auto', color: '#666' }}>
              {stats.total} ops · {stats.fieldsCount} fields ·{' '}
              {Object.entries(stats.byType)
                .map(([t, n]) => `${TYPE_LABEL[t] || t} ${n}`)
                .join(' · ')}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Date</th>
                  <th style={{ padding: 8 }}>Field</th>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Detail</th>
                  <th style={{ padding: 8 }}>Season</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((op) => (
                  <tr key={op.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{fmtDate(op.startDate)}</td>
                    <td style={{ padding: 8 }}>{op.fieldName}</td>
                    <td style={{ padding: 8 }}>
                      <span
                        style={{
                          color: TYPE_COLOUR[op.type] || '#444',
                          fontWeight: 600,
                        }}
                      >
                        {TYPE_LABEL[op.type] || op.type}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{describeOp(op)}</td>
                    <td style={{ padding: 8, color: '#666' }}>{op.cropSeason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 500 && (
              <p style={{ color: '#888', marginTop: 8 }}>
                Showing first 500 of {filtered.length}. Use the filters to narrow.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
