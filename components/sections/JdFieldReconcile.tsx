'use client';

import { useMemo, useState } from 'react';
import { FarmData, JdFieldMapEntry } from '@/lib/types';

interface Props {
  db: FarmData;
  persist: (newDb: FarmData) => void;
}

// ─── Fuzzy match helpers ──────────────────────────────────────────────────

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`'']/g, '')        // apostrophes
    .replace(/[^a-z0-9 ]/g, ' ') // non-alphanumeric → space
    .replace(/\s+/g, ' ')
    .trim();
}

// Simple token-overlap score: proportion of JD tokens found in hub name.
function similarity(jd: string, hub: string): number {
  const a = normalise(jd).split(' ').filter(Boolean);
  const b = normalise(hub).split(' ').filter(Boolean);
  if (!a.length || !b.length) return 0;
  const hits = a.filter((t) => b.some((u) => u.startsWith(t) || t.startsWith(u)));
  return hits.length / Math.max(a.length, b.length);
}

function bestMatch(jdName: string, hubFields: { name: string; parcel: string }[]): string | null {
  let best = 0;
  let match: string | null = null;
  for (const f of hubFields) {
    const s = similarity(jdName, f.name);
    if (s > best) { best = s; match = f.parcel; }
  }
  return best >= 0.4 ? match : null;
}

// ─── Colour helpers ───────────────────────────────────────────────────────

function rowBg(entry: JdFieldMapEntry): string {
  if (entry.hubParcel === '__IGNORE__') return '#1a1a2e';
  if (entry.confirmed) return '#0d2b0d';
  if (entry.hubParcel) return '#1a2b1a';
  return '#2b1a1a';
}

// ─── Component ────────────────────────────────────────────────────────────

export default function JdFieldReconcile({ db, persist }: Props) {
  // Build the canonical Hub field list from db.fields.
  const hubFields = useMemo(() =>
    (db.fields || [])
      .filter((f) => f.parcel)
      .map((f) => ({ name: f.name || f.parcel || '', parcel: f.parcel! }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [db.fields]
  );

  // All distinct JD field names from jdOperations.
  const jdNames = useMemo(() => {
    const s = new Set<string>();
    for (const op of db.jdOperations || []) {
      if (op.fieldName) s.add(op.fieldName);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [db.jdOperations]);

  // Initialise working state from saved map + auto-suggestions for unmapped names.
  const [entries, setEntries] = useState<JdFieldMapEntry[]>(() => {
    const saved = new Map((db.jdFieldMap || []).map((e) => [e.jdName, e]));
    return jdNames.map((jdName) => {
      if (saved.has(jdName)) return saved.get(jdName)!;
      const suggested = bestMatch(jdName, hubFields);
      return { jdName, hubParcel: suggested || '', confirmed: false };
    });
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'confirmed'>('all');

  function updateEntry(jdName: string, hubParcel: string) {
    setEntries((prev) =>
      prev.map((e) => e.jdName === jdName ? { ...e, hubParcel, confirmed: false } : e)
    );
    setSaved(false);
  }

  function toggleConfirm(jdName: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.jdName === jdName
          ? { ...e, confirmed: e.hubParcel ? !e.confirmed : e.confirmed }
          : e
      )
    );
    setSaved(false);
  }

  function confirmAll() {
    setEntries((prev) =>
      prev.map((e) => ({ ...e, confirmed: !!e.hubParcel }))
    );
    setSaved(false);
  }

  async function saveMap() {
    setSaving(true);
    try {
      const newDb: FarmData = { ...db, jdFieldMap: entries };
      await persist(newDb);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'unmatched') return entries.filter((e) => !e.hubParcel || e.hubParcel === '__IGNORE__' ? false : !e.confirmed);
    if (filter === 'confirmed') return entries.filter((e) => e.confirmed);
    return entries;
  }, [entries, filter]);

  const stats = useMemo(() => ({
    total: entries.length,
    matched: entries.filter((e) => e.hubParcel && e.hubParcel !== '__IGNORE__').length,
    confirmed: entries.filter((e) => e.confirmed).length,
    ignored: entries.filter((e) => e.hubParcel === '__IGNORE__').length,
    unmatched: entries.filter((e) => !e.hubParcel).length,
  }), [entries]);

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
          JD Field Name Reconciliation
        </h2>
        <p style={{ color: '#aaa', fontSize: 14, margin: 0 }}>
          Match each John Deere field name to the correct field in the Farm Hub.
          Green = confirmed. Auto-suggestions are pre-filled — review and confirm each row.
          Fields on neighbouring farms should be set to <strong style={{ color: '#ccc' }}>Ignore</strong>.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total JD fields', value: stats.total, color: '#888' },
          { label: 'Matched', value: stats.matched, color: '#5a9' },
          { label: 'Confirmed', value: stats.confirmed, color: '#3c3' },
          { label: 'Ignored', value: stats.ignored, color: '#888' },
          { label: 'Unmatched', value: stats.unmatched, color: '#e55' },
        ].map((s) => (
          <div key={s.label} style={{
            background: '#1e1e1e', border: '1px solid #333', borderRadius: 8,
            padding: '10px 18px', minWidth: 100,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #333' }}>
          {(['all', 'unmatched', 'confirmed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
              background: filter === f ? '#2a6' : '#1e1e1e',
              color: filter === f ? '#fff' : '#aaa',
            }}>
              {f === 'all' ? `All (${stats.total})` : f === 'unmatched' ? `Needs review (${stats.total - stats.confirmed - stats.ignored})` : `Confirmed (${stats.confirmed})`}
            </button>
          ))}
        </div>
        <button onClick={confirmAll} style={{
          padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #2a6',
          background: 'transparent', color: '#2a6', cursor: 'pointer',
        }}>
          ✓ Confirm all matched
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={saveMap} disabled={saving} style={{
          padding: '8px 24px', fontSize: 14, fontWeight: 600, borderRadius: 6,
          border: 'none', cursor: saving ? 'wait' : 'pointer',
          background: saved ? '#2a6' : '#1a6fca',
          color: '#fff',
        }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save map to Hub'}
        </button>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #333' }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 90px 80px',
          padding: '10px 16px', background: '#1a1a1a',
          fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          <div>JD Field Name</div>
          <div>Hub Field</div>
          <div>Ops</div>
          <div>Status</div>
        </div>

        {filtered.map((entry, i) => {
          const opCount = (db.jdOperations || []).filter((o) => o.fieldName === entry.jdName).length;
          const hubField = hubFields.find((f) => f.parcel === entry.hubParcel);

          return (
            <div key={entry.jdName} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 90px 80px',
              padding: '10px 16px', alignItems: 'center',
              background: rowBg(entry),
              borderTop: i === 0 ? 'none' : '1px solid #2a2a2a',
            }}>
              {/* JD name */}
              <div style={{ fontSize: 14, color: '#e0e0e0', fontFamily: 'monospace' }}>
                {entry.jdName}
              </div>

              {/* Hub field selector */}
              <div>
                <select
                  value={entry.hubParcel}
                  onChange={(e) => updateEntry(entry.jdName, e.target.value)}
                  style={{
                    width: '100%', background: '#111', color: entry.hubParcel ? '#e0e0e0' : '#888',
                    border: '1px solid #444', borderRadius: 5, padding: '5px 8px', fontSize: 13,
                  }}
                >
                  <option value="">— not matched —</option>
                  <option value="__IGNORE__">🚫 Ignore (not our field)</option>
                  <optgroup label="Hub fields">
                    {hubFields.map((f) => (
                      <option key={f.parcel} value={f.parcel}>
                        {f.name}{f.name !== f.parcel ? ` (${f.parcel})` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {hubField && !entry.confirmed && (
                  <div style={{ fontSize: 11, color: '#5a9', marginTop: 2 }}>
                    ↳ suggested match
                  </div>
                )}
              </div>

              {/* Op count */}
              <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center' }}>
                {opCount} op{opCount !== 1 ? 's' : ''}
              </div>

              {/* Confirm toggle */}
              <div style={{ textAlign: 'center' }}>
                {entry.hubParcel === '__IGNORE__' ? (
                  <span style={{ fontSize: 12, color: '#666' }}>ignored</span>
                ) : (
                  <button
                    onClick={() => toggleConfirm(entry.jdName)}
                    disabled={!entry.hubParcel}
                    style={{
                      padding: '4px 12px', fontSize: 12, borderRadius: 5, border: 'none',
                      cursor: entry.hubParcel ? 'pointer' : 'not-allowed',
                      background: entry.confirmed ? '#2a6' : '#333',
                      color: entry.confirmed ? '#fff' : '#888',
                    }}
                  >
                    {entry.confirmed ? '✓ OK' : 'Confirm'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', padding: 40 }}>
          No fields match this filter.
        </div>
      )}

      {/* Footer hint */}
      <div style={{ marginTop: 16, fontSize: 12, color: '#555' }}>
        {stats.confirmed} of {stats.total} fields confirmed · {stats.ignored} ignored ·{' '}
        {stats.unmatched} still unmatched.
        Once complete, click <strong style={{ color: '#aaa' }}>Save map to Hub</strong> — the JD sync
        will use this table to auto-populate drilling dates &amp; varieties in the Cropping plan.
      </div>
    </div>
  );
}
