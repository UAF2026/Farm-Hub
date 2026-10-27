'use client';

import { useMemo, useState } from 'react';
import type { FarmData, Obligation, ObligationDate } from '@/lib/types';
import { obligationDates, describeObligation, todayISO, addDaysISO, fmt } from '@/lib/secretary';
import { uid } from '@/lib/utils';

// The secretary's diary: things that come round every month or year. Claude
// suggests them (status 'suggested'); James confirms, edits or rejects them.
// Confirmed ones remind him on My day ahead of each date.

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  addActivity: (msg: string) => void;
}

const CATEGORIES: Obligation['category'][] = ['Money', 'Schemes', 'Compliance', 'Livestock', 'Crops', 'Machinery', 'Land', 'Admin'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function leadLabel(n: number) {
  if (n === 0) return 'on the day';
  if (n % 7 === 0) return `${n / 7} week${n === 7 ? '' : 's'} before`;
  return `${n} days before`;
}

export default function FarmYear({ db, persist, addActivity }: Props) {
  const all = db.obligations || [];
  const suggested = all.filter(o => o.status === 'suggested');
  const confirmed = all.filter(o => o.status === 'confirmed');
  const [editing, setEditing] = useState<Obligation | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const save = (o: Obligation) => persist({ ...db, obligations: all.some(x => x.id === o.id) ? all.map(x => (x.id === o.id ? o : x)) : [...all, o] });
  // A newly kept reminder starts today, so it doesn't back-fill missed dates as overdue.
  const startToday = (o: Obligation) => ({ ...o, startsOn: o.startsOn || todayISO() });
  const setStatus = (o: Obligation, status: Obligation['status']) => {
    save(status === 'confirmed' ? { ...startToday(o), status } : { ...o, status });
    if (status === 'confirmed') addActivity(`Farm year: added "${o.title}"`);
  };

  // The next 12 months, month by month.
  const today = todayISO();
  const year = useMemo(() => {
    const until = addDaysISO(today, 365);
    const rows = confirmed.flatMap(o => obligationDates(o, today, until).map(d => ({ d, o })));
    const byMonth = new Map<string, { d: string; o: Obligation }[]>();
    for (const r of rows.sort((a, b) => a.d.localeCompare(b.d))) {
      const k = r.d.slice(0, 7);
      // Monthly jobs only once per month list, so they don't swamp it.
      byMonth.set(k, [...(byMonth.get(k) || []), r]);
    }
    return Array.from(byMonth.entries());
  }, [confirmed, today]);

  if (editing) {
    return <Editor value={editing} onCancel={() => setEditing(null)} onSave={o => { save(startToday(o)); setEditing(null); }} />;
  }

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>Farm year</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.6 }}>
          Things that come round every month or year. Each one you keep reminds you on <strong>My day</strong> ahead of time.
        </div>
      </div>

      {suggested.length > 0 && (
        <div className="card hub-form" style={{ borderLeft: '4px solid var(--amber)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
          <div className="card-title">To check: {suggested.length} suggested by Claude</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            Tap <strong>Yes</strong> to keep, <strong>Edit</strong> to fix the date or warning, <strong>No</strong> if it’s not yours.
          </div>
          {suggested.map(o => (
            <div key={o.id} className="agenda-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="agenda-chip" style={{ background: 'var(--gray)' }}>{o.category}</span>
                  <span style={{ fontWeight: 500 }}>{o.title}</span>
                  {o.amount ? <span>£{o.amount.toLocaleString('en-GB')}</span> : null}
                </div>
                <div className="row-sub">{describeObligation(o)} · remind {leadLabel(o.leadDays)}{o.endsOn ? ` · until ${fmt(o.endsOn)} ${o.endsOn.slice(0, 4)}` : ''}</div>
                {o.notes && <div className="row-sub" style={{ marginTop: 2 }}>{o.notes}</div>}
              </div>
              <div className="agenda-actions">
                <button className="btn-add" onClick={() => setStatus(o, 'confirmed')}>Yes</button>
                <button className="btn-cancel" onClick={() => setEditing(o)}>Edit</button>
                <button className="btn-cancel" onClick={() => setStatus(o, 'rejected')}>No</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card hub-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>The next 12 months</div>
          <button className="btn-add" onClick={() => setEditing({ id: uid(), title: '', category: 'Admin', every: 'year', dates: [{ month: Number(today.slice(5, 7)), day: 1 }], leadDays: 14, status: 'confirmed' })}>
            + Add your own
          </button>
        </div>
        {!year.length && <div className="empty" style={{ marginTop: 8 }}>Nothing kept yet. Tick some suggestions above, or add your own.</div>}
        {year.map(([month, rows]) => (
          <div key={month} style={{ marginTop: 12 }}>
            <div className="link-group-title">{new Date(month + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
            {rows.map(({ d, o }) => (
              <div key={o.id + d} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setEditing(o)}>
                <div style={{ minWidth: 0 }}>
                  <div className="row-name">{o.title}{o.amount ? ` · £${o.amount.toLocaleString('en-GB')}` : ''}</div>
                  <div className="row-sub">{fmt(d)} · {o.category}{o.every === 'month' ? ' · monthly' : ''}</div>
                </div>
                <span className="row-sub">Edit</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {all.some(o => o.status === 'rejected') && (
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <button className="btn-cancel" onClick={() => setShowRejected(s => !s)}>{showRejected ? 'Hide' : 'Show'} ones you said no to</button>
          {showRejected && (
            <div className="card hub-form" style={{ marginTop: 8, textAlign: 'left' }}>
              {all.filter(o => o.status === 'rejected').map(o => (
                <div key={o.id} className="row-item">
                  <div className="row-name" style={{ color: 'var(--text-muted)' }}>{o.title}</div>
                  <button className="btn-cancel" onClick={() => setStatus(o, 'confirmed')}>Keep after all</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ─── Add / edit ───────────────────────────────────────────────────────── */

function Editor({ value, onSave, onCancel }: { value: Obligation; onSave: (o: Obligation) => void; onCancel: () => void }) {
  const [o, setO] = useState<Obligation>(value);
  const dates = o.dates || [];
  const setDate = (i: number, patch: Partial<ObligationDate>) => setO({ ...o, dates: dates.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const valid = o.title.trim() && (o.every === 'month' ? (o.day || 0) >= 1 : dates.length > 0);

  return (
    <div className="card hub-form">
      <div className="card-title">{value.title ? 'Edit reminder' : 'New reminder'}</div>
      <label className="form-label">What needs doing</label>
      <input type="text" value={o.title} onChange={e => setO({ ...o, title: e.target.value })} placeholder="e.g. Invoice the straw buyers" />

      <div className="grid2">
        <div>
          <label className="form-label">Type</label>
          <select value={o.category} onChange={e => setO({ ...o, category: e.target.value as Obligation['category'] })}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">How often</label>
          <select value={o.every} onChange={e => setO({ ...o, every: e.target.value as Obligation['every'], day: o.day || 1, dates: o.dates?.length ? o.dates : [{ month: 1, day: 1 }] })}>
            <option value="year">On set dates each year</option>
            <option value="month">Every month</option>
          </select>
        </div>
      </div>

      {o.every === 'month' ? (
        <>
          <label className="form-label">Day of the month</label>
          <input type="number" min={1} max={31} value={o.day || 1} onChange={e => setO({ ...o, day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })} />
        </>
      ) : (
        <>
          <label className="form-label">Date(s) each year</label>
          {dates.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input type="number" min={1} max={31} value={d.day} onChange={e => setDate(i, { day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })} style={{ width: 70, marginBottom: 0 }} aria-label="Day" />
              <select value={d.month} onChange={e => setDate(i, { month: Number(e.target.value) })} style={{ marginBottom: 0 }} aria-label="Month">
                {MONTHS.map((m, j) => <option key={m} value={j + 1}>{m}</option>)}
              </select>
              {dates.length > 1 && <button className="del-btn" onClick={() => setO({ ...o, dates: dates.filter((_, j) => j !== i) })} aria-label="Remove date">×</button>}
            </div>
          ))}
          <button className="btn-cancel" style={{ marginBottom: 10 }} onClick={() => setO({ ...o, dates: [...dates, { month: 1, day: 1 }] })}>+ Another date</button>
        </>
      )}

      <div className="grid2">
        <div>
          <label className="form-label">Remind me</label>
          <select value={o.leadDays} onChange={e => setO({ ...o, leadDays: Number(e.target.value) })}>
            {[0, 3, 7, 14, 21, 30, 45, 60, 90].map(n => <option key={n} value={n}>{leadLabel(n)}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Amount £ (optional)</label>
          <input type="number" value={o.amount ?? ''} onChange={e => setO({ ...o, amount: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
      </div>
      <label className="form-label">Notes</label>
      <textarea rows={3} value={o.notes || ''} onChange={e => setO({ ...o, notes: e.target.value })} placeholder="Why it matters, who to ring, where the paperwork is…" />

      <div className="modal-btns" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
        <button className="btn-primary" disabled={!valid} onClick={() => onSave({ ...o, title: o.title.trim(), status: 'confirmed' })}>Save and keep</button>
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
