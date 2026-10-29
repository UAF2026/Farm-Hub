'use client';

import { useState, useMemo } from 'react';
import { FarmData, Initiative } from '@/lib/types';
import { uid } from '@/lib/utils';
import type { Section } from '../FarmHub';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  onNavigate?: (s: Section) => void;
}

/* ─── Textarea auto-grow helper (matches FarmBible.tsx) ─────────────────── */
function Textarea({ value, onChange, rows = 3, placeholder = '' }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
    />
  );
}

function fmtGBP(n: number) {
  return '£' + Math.round(Math.abs(n)).toLocaleString('en-GB');
}

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T12:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

const AREAS: Initiative['area'][] = ['Scheme income', 'Land & tenancy', 'Enterprise', 'Succession', 'Other'];
const AREA_COLOURS: Record<string, string> = {
  'Scheme income': '#d4a017',
  'Land & tenancy': '#52796f',
  'Enterprise': '#2d6a4f',
  'Succession': '#3d405b',
  'Other': '#888',
};
const STATUS_COLOURS: Record<string, string> = {
  'Active': '#2d7d46',
  'Waiting': '#c17b00',
  'Blocked': '#b33a3a',
  'Done': '#999',
};

/* ─── Initiatives chapter ────────────────────────────────────────────────── */
function InitiativesPanel({ db, persist }: { db: FarmData; persist: (d: FarmData) => void }) {
  const initiatives = db.initiatives ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterArea, setFilterArea] = useState<string>('All');
  const [showDone, setShowDone] = useState(false);

  const emptyForm = (): Initiative => ({
    id: uid(), title: '', area: 'Scheme income', status: 'Active',
    targetDate: '', annualValueAtStake: 0, nextAction: '', owner: '', notes: '',
    updatedAt: new Date().toISOString(),
  });
  const [form, setForm] = useState<Initiative>(emptyForm());
  const f = (k: keyof Initiative) => (v: string | number) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = () => { setForm(emptyForm()); setEditingId('new'); };
  const openEdit = (i: Initiative) => { setForm({ ...i }); setEditingId(i.id); };
  const cancel = () => setEditingId(null);

  const save = () => {
    const updated = { ...form, updatedAt: new Date().toISOString() };
    const list = editingId === 'new'
      ? [...initiatives, updated]
      : initiatives.map(i => i.id === editingId ? updated : i);
    persist({ ...db, initiatives: list });
    setEditingId(null);
  };
  const remove = (id: string) => {
    if (!confirm('Remove this initiative?')) return;
    persist({ ...db, initiatives: initiatives.filter(i => i.id !== id) });
  };

  const sorted = useMemo(() => {
    const order = { 'Blocked': 0, 'Active': 1, 'Waiting': 2, 'Done': 3 };
    return [...initiatives].sort((a, b) => {
      const byStatus = order[a.status] - order[b.status];
      if (byStatus !== 0) return byStatus;
      const da = daysUntil(a.targetDate); const db2 = daysUntil(b.targetDate);
      if (da === null && db2 === null) return 0;
      if (da === null) return 1;
      if (db2 === null) return -1;
      return da - db2;
    });
  }, [initiatives]);

  const filtered = sorted.filter(i => (filterArea === 'All' || i.area === filterArea) && (showDone || i.status !== 'Done'));

  if (editingId !== null) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>{editingId === 'new' ? 'Add initiative' : 'Edit initiative'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <label className="form-label">Title *</label>
            <input value={form.title} onChange={e => f('title')(e.target.value)} placeholder="Scheme income transition — SFI26 / CSHT" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">Area</label>
              <select value={form.area} onChange={e => f('area')(e.target.value as Initiative['area'])}>
                {AREAS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Status</label>
              <select value={form.status} onChange={e => f('status')(e.target.value as Initiative['status'])}>
                {['Active', 'Waiting', 'Blocked', 'Done'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Target date</label>
              <input type="date" value={form.targetDate ?? ''} onChange={e => f('targetDate')(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">£/yr at stake (if known)</label>
              <input type="number" step="1" value={form.annualValueAtStake || ''} onChange={e => f('annualValueAtStake')(+e.target.value)} />
            </div>
            <div>
              <label className="form-label">Owner — who's driving this</label>
              <input value={form.owner ?? ''} onChange={e => f('owner')(e.target.value)} placeholder="James / Savills / Natural England..." />
            </div>
          </div>
          <div>
            <label className="form-label">Next action — the one concrete next step *</label>
            <Textarea value={form.nextAction} onChange={f('nextAction')} rows={2} placeholder="What needs to happen next, and by when" />
          </div>
          <div>
            <label className="form-label">Notes — context, rationale, running log</label>
            <Textarea value={form.notes} onChange={f('notes')} rows={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
        <div className="card-title" style={{ margin: 0 }}>Initiatives ({filtered.length}{!showDone ? ` of ${initiatives.length}` : ''})</div>
        <button className="btn-primary" onClick={openAdd}>+ Add initiative</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        {['All', ...AREAS].map(a => (
          <button
            key={a}
            onClick={() => setFilterArea(a)}
            style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
              background: filterArea === a ? (AREA_COLOURS[a] || 'var(--green)') : '#eee',
              color: filterArea === a ? '#fff' : 'var(--text-muted)',
              border: 'none', fontFamily: 'inherit',
            }}
          >{a}</button>
        ))}
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show done
        </label>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {initiatives.length === 0
            ? 'No initiatives tracked yet. Add the big things that are still moving — a scheme application, a tenancy proposal, an enterprise decision — with one clear next action each.'
            : 'Nothing in this filter.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {filtered.map(i => {
            const days = daysUntil(i.targetDate);
            const overdue = days !== null && days < 0 && i.status !== 'Done';
            const urgent = days !== null && days >= 0 && days <= 14 && i.status !== 'Done';
            return (
              <div key={i.id} className="card" style={{ borderLeft: `4px solid ${overdue ? 'var(--red)' : urgent ? 'var(--amber)' : (AREA_COLOURS[i.area] || '#888')}`, opacity: i.status === 'Done' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{i.title}</span>
                      <span style={{ fontSize: 11, background: AREA_COLOURS[i.area] || '#888', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>{i.area}</span>
                      <span style={{ fontSize: 11, background: '#eee', color: STATUS_COLOURS[i.status] || '#555', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{i.status}</span>
                      {overdue && <span style={{ fontSize: 11, background: 'var(--red)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>OVERDUE</span>}
                      {urgent && <span style={{ fontSize: 11, background: 'var(--amber)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>{days}d left</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: '0.5rem', fontSize: 12, color: 'var(--text-muted)' }}>
                      {i.targetDate && <span>Target: {new Date(i.targetDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                      {!!i.annualValueAtStake && <span style={{ color: 'var(--green)', fontWeight: 600 }}>£{Math.abs(i.annualValueAtStake).toLocaleString()}/yr at stake</span>}
                      {i.owner && <span>Owner: {i.owner}</span>}
                    </div>
                    {i.nextAction && (
                      <p style={{ fontSize: 13, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
                        <strong>Next:</strong> {i.nextAction}
                      </p>
                    )}
                    {i.notes && <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{i.notes}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(i)}>Edit</button>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(i.id)}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main Strategy section ──────────────────────────────────────────────── */
export default function Strategy({ db, persist, onNavigate }: Props) {
  const agreements = db.farmBible?.agreements ?? [];
  const schemeAgreements = agreements.filter(a => a.type === 'Scheme' && (a.annualValue || 0) > 0);

  const schemeSummary = useMemo(() => {
    let secured = 0, atRisk = 0, expired = 0;
    for (const a of schemeAgreements) {
      const days = daysUntil(a.endDate);
      const v = a.annualValue || 0;
      if (days === null) secured += v;
      else if (days < 0) expired += v;
      else if (days < 365) atRisk += v;
      else secured += v;
    }
    return { secured, atRisk, expired, total: secured + atRisk + expired };
  }, [schemeAgreements]);

  const agreementsAtRisk = useMemo(() => {
    return agreements
      .filter(a => {
        const d = daysUntil(a.endDate);
        return d !== null && d < 365;
      })
      .sort((a, b) => (daysUntil(a.endDate) ?? 0) - (daysUntil(b.endDate) ?? 0));
  }, [agreements]);

  const initiatives = db.initiatives ?? [];
  const activeCount = initiatives.filter(i => i.status === 'Active' || i.status === 'Blocked').length;

  const summaryCard = (accent: string): React.CSSProperties => ({
    flex: 1, minWidth: 140, background: '#fff', border: '1px solid var(--border)',
    borderRadius: 8, padding: '0.9rem 1.1rem', borderLeft: `3px solid ${accent}`,
  });

  return (
    <div className="section">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: 20, fontFamily: 'Lora, serif', color: 'var(--green)', margin: '0 0 0.25rem' }}>🧭 Strategy</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          The crucial decisions in flight — scheme income, land & tenancy, enterprise direction, succession. Agreements and the decisions log live in 📚 Farm Bible; this is where the open threads and next actions sit.
        </p>
      </div>

      {/* Scheme income summary */}
      <div className="card">
        <div className="card-title" style={{ margin: '0 0 0.75rem' }}>Scheme income (from Farm Bible agreements)</div>
        {schemeAgreements.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No scheme agreements recorded in Farm Bible yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div style={summaryCard('#2d7d46')}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Secured (12mo+)</div>
                <div style={{ fontSize: 20, fontFamily: 'Lora, serif', color: '#2d7d46', marginTop: 4 }}>{fmtGBP(schemeSummary.secured)}/yr</div>
              </div>
              <div style={summaryCard('#c17b00')}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>At risk (&lt;12mo)</div>
                <div style={{ fontSize: 20, fontFamily: 'Lora, serif', color: '#c17b00', marginTop: 4 }}>{fmtGBP(schemeSummary.atRisk)}/yr</div>
              </div>
              {schemeSummary.expired > 0 && (
                <div style={summaryCard('#b33a3a')}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Expired</div>
                  <div style={{ fontSize: 20, fontFamily: 'Lora, serif', color: '#b33a3a', marginTop: 4 }}>{fmtGBP(schemeSummary.expired)}/yr</div>
                </div>
              )}
              <div style={summaryCard('#555')}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total scheme income</div>
                <div style={{ fontSize: 20, fontFamily: 'Lora, serif', color: '#333', marginTop: 4 }}>{fmtGBP(schemeSummary.total)}/yr</div>
              </div>
            </div>
            {schemeSummary.atRisk > 0 && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px' }}>
                ⚠️ {fmtGBP(schemeSummary.atRisk)}/yr of scheme income ends within 12 months with no confirmed replacement in Farm Bible yet.
              </div>
            )}
          </>
        )}
      </div>

      {/* Agreements expiring soon, across all types */}
      {agreementsAtRisk.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--red)' }}>
          <div className="card-title" style={{ margin: '0 0 0.5rem', color: 'var(--red)' }}>Agreements expiring within 12 months</div>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {agreementsAtRisk.map(a => {
              const d = daysUntil(a.endDate);
              return (
                <div key={a.id} className="row-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-name">{a.name}</div>
                    <div className="row-sub">{a.counterparty} · ends {a.endDate ? new Date(a.endDate).toLocaleDateString('en-GB') : ''}{a.annualValue ? ` · ${fmtGBP(a.annualValue)}/yr` : ''}</div>
                  </div>
                  <span className={`badge ${d !== null && d < 0 ? 'bg-red' : d !== null && d < 30 ? 'bg-red' : 'bg-amber'}`}>
                    {d !== null && d < 0 ? 'Expired' : `${d}d left`}
                  </span>
                </div>
              );
            })}
          </div>
          {onNavigate && (
            <button className="btn-secondary" style={{ marginTop: 10, fontSize: 12 }} onClick={() => onNavigate('farmbible')}>Open in Farm Bible →</button>
          )}
        </div>
      )}

      {/* Initiatives tracker */}
      <div className="card">
        <InitiativesPanel db={db} persist={persist} />
      </div>

      {/* Quick links to the rest of the brain */}
      {onNavigate && (
        <div className="card">
          <div className="card-title" style={{ margin: '0 0 0.5rem' }}>The rest of the brain</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => onNavigate('farmbible')}>📚 Enterprises & margins</button>
            <button className="btn-secondary" onClick={() => onNavigate('farmbible')}>📖 Decisions log</button>
            <button className="btn-secondary" onClick={() => onNavigate('costings')}>💰 Budget</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            {activeCount} active initiative{activeCount !== 1 ? 's' : ''} tracked here. Enterprise economics and the decisions log live under Farm Bible — this page pulls the urgent bits forward.
          </p>
        </div>
      )}
    </div>
  );
}
