'use client';

import { useState, useEffect, useMemo } from 'react';
import { FarmData, DiaryEntry } from '@/lib/types';
import { fmtDate } from '@/lib/utils';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  addActivity: (msg: string) => void;
}

interface BrainDumpEntry {
  id: string;
  created_at: string;
  content: string;
  tag: string;
  status: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Convert YYYY-MM-DD to the DD/MM/YYYY format used by the Activity log's `time` field.
function isoToEnGb(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function Diary({ db, persist, addActivity }: Props) {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [noteDraft, setNoteDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [brainDumpEntries, setBrainDumpEntries] = useState<BrainDumpEntry[]>([]);
  const [loadingDump, setLoadingDump] = useState(true);

  useEffect(() => {
    setLoadingDump(true);
    fetch('/api/braindump')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setBrainDumpEntries(Array.isArray(data) ? data : []))
      .catch(() => setBrainDumpEntries([]))
      .finally(() => setLoadingDump(false));
  }, []);

  const existingEntry = useMemo(
    () => (db.diary ?? []).find(d => d.date === selectedDate),
    [db.diary, selectedDate]
  );

  useEffect(() => {
    setNoteDraft(existingEntry?.note ?? '');
    setSaved(false);
  }, [selectedDate, existingEntry]);

  function saveNote() {
    const existing = db.diary ?? [];
    const idx = existing.findIndex(d => d.date === selectedDate);
    const entry: DiaryEntry = { date: selectedDate, note: noteDraft, updatedAt: new Date().toISOString() };
    const updated = idx >= 0
      ? existing.map((d, i) => (i === idx ? entry : d))
      : [...existing, entry];
    persist({ ...db, diary: updated });
    addActivity(`Diary note saved for ${fmtDate(selectedDate)}`);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // ── Auto rollup for the selected day ─────────────────────────────────────
  const enGbDate = isoToEnGb(selectedDate);

  const tasksDoneToday = (db.tasks ?? []).filter(t => t.doneDate === selectedDate);
  const tasksDueToday = (db.tasks ?? []).filter(t => t.date === selectedDate && !t.done);
  const financeToday = (db.finance ?? []).filter(f => f.date === selectedDate);
  const paymentsToday = (db.finance ?? []).filter(f => f.paidDate === selectedDate);
  const opsToday = (db.fieldOperations ?? []).filter(o => o.date === selectedDate);
  const activityToday = (db.activity ?? []).filter(a => a.time === enGbDate);
  const dumpToday = brainDumpEntries.filter(e => (e.created_at || '').slice(0, 10) === selectedDate);

  const isToday = selectedDate === todayIso();
  const hasAnything = tasksDoneToday.length || tasksDueToday.length || financeToday.length ||
    paymentsToday.length || opsToday.length || activityToday.length || dumpToday.length;

  function shiftDay(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '12px 12px 80px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, margin: 0, color: 'var(--green)' }}>
          📔 Diary
        </h2>
        <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
          Everything logged that day, plus your own notes on top.
        </p>
      </div>

      {/* Date navigator */}
      <div className="card" style={{ marginBottom: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => shiftDay(-1)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>◀</button>
        <input
          type="date"
          value={selectedDate}
          max={todayIso()}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}
        />
        <button onClick={() => shiftDay(1)} disabled={isToday} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', background: isToday ? '#f5f5f5' : '#fff', cursor: isToday ? 'default' : 'pointer', color: isToday ? '#bbb' : '#222' }}>▶</button>
        {!isToday && (
          <button onClick={() => setSelectedDate(todayIso())} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>Today</button>
        )}
      </div>

      {/* Free-text note */}
      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div className="card-title">Notes — {fmtDate(selectedDate)}</div>
        <textarea
          value={noteDraft}
          onChange={e => setNoteDraft(e.target.value)}
          placeholder="Weather, what happened, who did what, anything worth remembering..."
          style={{
            width: '100%', minHeight: 110, resize: 'vertical', marginTop: 8,
            border: '1px solid #ddd', borderRadius: 8, padding: 10,
            fontSize: 14, fontFamily: 'var(--font-body)', lineHeight: 1.5, boxSizing: 'border-box',
          }}
        />
        <button
          onClick={saveNote}
          disabled={noteDraft === (existingEntry?.note ?? '')}
          style={{
            marginTop: 8, padding: '8px 16px', borderRadius: 8, border: 'none',
            background: noteDraft === (existingEntry?.note ?? '') ? '#ccc' : 'var(--green)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: noteDraft === (existingEntry?.note ?? '') ? 'default' : 'pointer',
          }}
        >
          {saved ? '✓ Saved' : 'Save note'}
        </button>
      </div>

      {/* Auto rollup */}
      <div className="card" style={{ padding: 14 }}>
        <div className="card-title">What was logged that day</div>
        {loadingDump ? (
          <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>
        ) : !hasAnything ? (
          <p style={{ color: '#888', fontSize: 13 }}>Nothing logged elsewhere in the Hub for this day.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
            {opsToday.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#2980b9' }}>🚜 Farm jobs</p>
                {opsToday.map(o => (
                  <div key={o.id} style={{ fontSize: 13, marginBottom: 3 }}>
                    {o.operation} — {o.field}{o.crop ? ` (${o.crop}${o.variety ? ', ' + o.variety : ''})` : ''}{o.rate ? ` @ ${o.rate}` : ''}
                  </div>
                ))}
              </div>
            )}
            {dumpToday.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#8e44ad' }}>🧠 Brain Dump</p>
                {dumpToday.map(e => (
                  <div key={e.id} style={{ fontSize: 13, marginBottom: 3, whiteSpace: 'pre-wrap' }}>{e.content}</div>
                ))}
              </div>
            )}
            {tasksDoneToday.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#27ae60' }}>✓ Tasks completed</p>
                {tasksDoneToday.map(t => <div key={t.id} style={{ fontSize: 13, marginBottom: 3 }}>{t.name}</div>)}
              </div>
            )}
            {tasksDueToday.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#e67e22' }}>📌 Tasks due, not yet done</p>
                {tasksDueToday.map(t => <div key={t.id} style={{ fontSize: 13, marginBottom: 3 }}>{t.name}</div>)}
              </div>
            )}
            {financeToday.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#c0392b' }}>💷 Bills & invoices recorded</p>
                {financeToday.map((f, i) => <div key={f.id || i} style={{ fontSize: 13, marginBottom: 3 }}>{f.type}: {f.supplier} — £{(f.gross || f.amount || 0).toFixed(2)}</div>)}
              </div>
            )}
            {paymentsToday.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#16a085' }}>✅ Payments made</p>
                {paymentsToday.map((f, i) => <div key={f.id || i} style={{ fontSize: 13, marginBottom: 3 }}>{f.type}: {f.supplier} — £{(f.gross || f.amount || 0).toFixed(2)}</div>)}
              </div>
            )}
            {activityToday.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#888' }}>Other Hub activity</p>
                {activityToday.map((a, i) => <div key={i} style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>{a.msg}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
