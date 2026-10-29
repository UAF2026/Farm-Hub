'use client';

import { useMemo, useRef, useState } from 'react';
import type { FarmData, PrivateProperty, PropertyEntry, PropertyKeyDate } from '@/lib/types';
import { fmtDate, fmtMoney, uid } from '@/lib/utils';
import { PROPERTY_CATEGORIES, taxYear, currentTaxYear, yearSummary, needsPropertyAmount } from '@/lib/property';
import { rollKeyDate, todayISO, whenLabel } from '@/lib/secretary';
import { DOC_LABEL } from '@/lib/finance';

// Private → 8 Netherton Rd. A private investment, so its money is kept here and
// never in farm Finance. Totals run on the UK tax year (6 Apr – 5 Apr).

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const blankEntry = (kind: 'income' | 'cost'): PropertyEntry => ({
  id: uid(), date: todayISO(), kind, category: kind === 'income' ? 'Rental income' : 'Repairs & maintenance',
  supplier: '', desc: '', amount: 0, status: kind === 'income' ? 'Paid' : 'Outstanding',
});

function EntryModal({ entry, onSave, onDelete, onClose }: { entry: PropertyEntry; onSave: (e: PropertyEntry) => void; onDelete?: () => void; onClose: () => void }) {
  const [f, setF] = useState(entry);
  const set = (p: Partial<PropertyEntry>) => setF(x => ({ ...x, ...p }));
  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-title">{f.kind === 'income' ? 'Money in' : 'Cost'}</div>
        <div className="field-row">
          <div><label className="form-label">Date</label><input type="date" value={f.date} onChange={e => set({ date: e.target.value })} /></div>
          <div><label className="form-label">£</label><input type="number" inputMode="decimal" value={f.amount || ''} onChange={e => set({ amount: Number(e.target.value) || 0 })} /></div>
        </div>
        <label className="form-label">Type</label>
        <select value={f.category} onChange={e => set({ category: e.target.value })}>
          {PROPERTY_CATEGORIES[f.kind].map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="form-label">{f.kind === 'income' ? 'From' : 'Paid to'}</label>
        <input value={f.supplier} onChange={e => set({ supplier: e.target.value })} />
        <label className="form-label">What for</label>
        <input value={f.desc} onChange={e => set({ desc: e.target.value })} />
        <div className="field-row">
          <div><label className="form-label">Ref</label><input value={f.ref ?? ''} onChange={e => set({ ref: e.target.value || undefined })} /></div>
          <div>
            <label className="form-label">Status</label>
            <select value={f.status} onChange={e => set({ status: e.target.value as PropertyEntry['status'] })}>
              <option>Paid</option><option>Outstanding</option>
            </select>
          </div>
        </div>
        {f.status === 'Outstanding' && <><label className="form-label">Due</label><input type="date" value={f.due ?? ''} onChange={e => set({ due: e.target.value || undefined })} /></>}
        <div className="modal-btns">
          {onDelete && <button className="btn-add danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(f)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function KeyDateModal({ kd, onSave, onDelete, onClose }: { kd: PropertyKeyDate; onSave: (k: PropertyKeyDate) => void; onDelete?: () => void; onClose: () => void }) {
  const [f, setF] = useState(kd);
  const set = (p: Partial<PropertyKeyDate>) => setF(x => ({ ...x, ...p }));
  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-title">Check or renewal</div>
        <label className="form-label">What</label><input value={f.name} onChange={e => set({ name: e.target.value })} />
        <div className="field-row">
          <div><label className="form-label">Next due</label><input type="date" value={f.due} onChange={e => set({ due: e.target.value })} /></div>
          <div><label className="form-label">Every (months, blank = once)</label><input type="number" inputMode="numeric" value={f.everyMonths ?? ''} onChange={e => set({ everyMonths: Number(e.target.value) || undefined })} /></div>
        </div>
        <label className="form-label">Notes</label><textarea value={f.notes ?? ''} onChange={e => set({ notes: e.target.value || undefined })} />
        <div className="modal-btns">
          {onDelete && <button className="btn-add danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => f.name && onSave(f)}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function Property({ db, persist, addActivity }: Props) {
  const props = db.properties ?? [];
  const [pid, setPid] = useState(props[0]?.id ?? '');
  const p = props.find(x => x.id === pid) ?? props[0];
  const [year, setYear] = useState(currentTaxYear());
  const [entry, setEntry] = useState<PropertyEntry | null>(null);
  const [kd, setKd] = useState<PropertyKeyDate | null>(null);
  const [editDetails, setEditDetails] = useState(false);
  const [job, setJob] = useState<{ title: string; log: string[]; running: boolean } | null>(null);
  const stop = useRef(false);
  const dbRef = useRef(db);
  dbRef.current = db;

  const years = useMemo(() => {
    const ys = new Set([currentTaxYear(), ...(p?.entries ?? []).filter(e => e.date).map(e => taxYear(e.date))]);
    return Array.from(ys).sort().reverse();
  }, [p]);

  if (!p) return <div className="card"><div className="empty">No private property set up yet.</div></div>;

  const today = todayISO();
  const sum = yearSummary(p, year);
  const list = p.entries.filter(e => e.date && taxYear(e.date) === year).sort((a, b) => b.date.localeCompare(a.date));
  const missing = p.entries.filter(needsPropertyAmount);
  const dates = [...p.keyDates].filter(k => k.due).sort((a, b) => a.due.localeCompare(b.due));

  const saveProp = (next: PrivateProperty, base = dbRef.current) =>
    persist({ ...base, properties: (base.properties ?? []).map(x => (x.id === next.id ? next : x)) });
  const latest = () => (dbRef.current.properties ?? []).find(x => x.id === p.id)!;

  const saveEntry = (e: PropertyEntry) => {
    const exists = p.entries.some(x => x.id === e.id);
    saveProp({ ...p, entries: exists ? p.entries.map(x => (x.id === e.id ? e : x)) : [...p.entries, e] });
    setEntry(null);
  };
  const saveKd = (k: PropertyKeyDate) => {
    const exists = p.keyDates.some(x => x.id === k.id);
    saveProp({ ...p, keyDates: exists ? p.keyDates.map(x => (x.id === k.id ? k : x)) : [...p.keyDates, k] });
    setKd(null);
  };

  // Agent statements → income and cost lines.
  type StatementResult = { msgId: string; date: string; subject: string; fileName?: string; isStatement?: boolean; paidToOwner?: number | null; note?: string;
    lines?: { date: string; kind: 'income' | 'cost'; category: string; description: string; amount: number; ref: string }[] };
  /** Add one statement's lines; returns how many were new. */
  function addStatement(j: StatementResult): number {
    const cur = latest();
    const fresh: PropertyEntry[] = [];
    (j.isStatement ? j.lines ?? [] : []).forEach((l, n) => {
      if (!l.amount) return;
      const date = l.date || j.date;
      // The same line already in (e.g. a statement uploaded twice).
      if (cur.entries.some(e => e.kind === l.kind && e.date === date && Math.abs(e.amount - l.amount) < 0.01)) return;
      // A cost already logged from its own invoice (same £ within ~6 weeks), so it isn't counted twice.
      if (l.kind === 'cost' && cur.entries.some(e => e.kind === 'cost' && !e.id.startsWith('st-') && Math.abs(e.amount - l.amount) < 0.01
        && Math.abs(new Date(e.date).getTime() - new Date(date).getTime()) < 45 * 86400000)) return;
      fresh.push({ id: `st-${j.msgId}-${n}`, date, kind: l.kind, category: l.category, supplier: l.kind === 'income' ? 'Cornwall Estates (bookings)' : 'Cornwall Estates', desc: l.description, amount: l.amount, ref: l.ref || undefined, status: 'Paid', readFrom: j.fileName });
    });
    saveProp({ ...cur, entries: [...cur.entries, ...fresh], statementsRead: [...(cur.statementsRead ?? []), j.msgId] });
    return fresh.length;
  }
  const statementLine = (j: StatementResult, n: number) =>
    `${j.subject}: ${j.isStatement ? `${n} new line${n === 1 ? '' : 's'}${j.paidToOwner ? `, paid out ${fmtMoney(j.paidToOwner)}` : ''}` : j.note || 'not a statement'}`;

  async function readStatements() {
    stop.current = false;
    const log: string[] = [];
    setJob({ title: 'Reading account statements…', log, running: true });
    let added = 0;
    for (let i = 0; i < 200 && !stop.current; i++) {
      const res = await fetch('/api/property/read-statement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip: latest().statementsRead ?? [] }) });
      const j = await res.json();
      if (!res.ok) { log.unshift(j.error || `error ${res.status}`); break; }
      if (j.done) { log.unshift(`All ${j.total} statement emails read. Later statements are in the owner portal: download them and use Upload statements.`); break; }
      const n = addStatement(j);
      added += n;
      log.unshift(`${fmtDate(j.date)} ${statementLine(j, n)}`);
      setJob({ title: `Reading account statements… ${j.remaining} to go`, log: [...log], running: true });
      await new Promise(r => setTimeout(r, 50));
    }
    if (added) addActivity(`8 Netherton Rd: ${added} lines read from account statements`);
    setJob(x => (x ? { ...x, title: 'Account statements', running: false } : x));
  }

  // Statements downloaded from the agent's owner portal.
  async function uploadStatements(files: FileList | null) {
    if (!files?.length) return;
    stop.current = false;
    const log: string[] = [];
    setJob({ title: 'Reading uploaded statements…', log, running: true });
    let added = 0;
    for (const file of Array.from(files)) {
      if (stop.current) break;
      if (file.size > 3 * 1024 * 1024) { log.unshift(`${file.name}: too big (over 3 MB)`); continue; }
      const pdf = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(file); });
      const res = await fetch('/api/property/read-statement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pdf, fileName: file.name }) });
      const j = await res.json();
      if (!res.ok) { log.unshift(`${file.name}: ${j.error || `error ${res.status}`}`); if (res.status === 500) break; continue; }
      const n = addStatement(j);
      added += n;
      log.unshift(statementLine(j, n));
      setJob({ title: 'Reading uploaded statements…', log: [...log], running: true });
    }
    if (added) addActivity(`8 Netherton Rd: ${added} lines read from uploaded statements`);
    setJob(x => (x ? { ...x, title: 'Uploaded statements', running: false } : x));
  }

  // £0 costs → read the invoice PDF from Gmail (same reader as farm Finance).
  async function readAmounts() {
    stop.current = false;
    const log: string[] = [];
    setJob({ title: 'Reading invoices…', log, running: true });
    for (const e of missing) {
      if (stop.current) break;
      const res = await fetch('/api/finance/read-bill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplier: e.supplier, ref: e.ref, date: e.date, desc: e.desc }) });
      const j = await res.json();
      if (!res.ok) { log.unshift(j.error || `error ${res.status}`); break; }
      const cur = latest();
      const amount = j.found && typeof j.gross === 'number' && ['invoice', 'other'].includes(j.docType) ? Math.abs(j.gross) : 0;
      saveProp({ ...cur, entries: cur.entries.map(x => (x.id === e.id ? { ...x, amount: amount || x.amount, docType: j.docType, readFrom: j.fileName, readTried: today, due: x.due || j.dueDate || undefined } : x)) });
      log.unshift(`${e.supplier}: ${!j.found ? j.note || 'no PDF found' : amount ? fmtMoney(amount) : DOC_LABEL[j.docType] || j.docType}`);
      setJob({ title: 'Reading invoices…', log: [...log], running: true });
    }
    setJob(x => (x ? { ...x, title: 'Invoices', running: false } : x));
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>{p.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{p.use} · {p.address} · {p.owners}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>A private investment: kept here, out of the farm accounts.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {props.length > 1 && (
            <select value={p.id} onChange={e => setPid(e.target.value)} style={{ padding: '7px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              {props.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '7px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14 }}>
            {years.map(y => <option key={y} value={y}>Tax year {y}</option>)}
          </select>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Money in</div><div className="metric-value">{fmtMoney(sum.income)}</div><div className="metric-sub">tax year {year}</div></div>
        <div className="metric-card"><div className="metric-label">Costs</div><div className="metric-value">{fmtMoney(sum.costs)}</div><div className="metric-sub">{sum.missing ? `${sum.missing} with no amount yet` : 'all with amounts'}</div></div>
        <div className="metric-card"><div className="metric-label">Profit</div><div className="metric-value" style={{ color: sum.profit < 0 ? 'var(--red)' : undefined }}>{sum.profit < 0 ? `−${fmtMoney(-sum.profit)}` : fmtMoney(sum.profit)}</div><div className="metric-sub">before tax and mortgage capital</div></div>
        <div className="metric-card"><div className="metric-label">Next check</div><div className="metric-value" style={{ fontSize: 18 }}>{dates[0] ? dates[0].name : '—'}</div><div className="metric-sub">{dates[0] ? whenLabel(dates[0].due, today) : ''}</div></div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Checks and renewals</div>
          <button className="btn-add" onClick={() => setKd({ id: uid(), name: '', due: today, everyMonths: 12 })}>+ Add</button>
        </div>
        <div className="row-sub" style={{ margin: '4px 0 6px' }}>These come up on My day 6 weeks before they’re due. Ticking one done moves it on a year.</div>
        {dates.length === 0 && <div className="empty">None yet.</div>}
        {dates.map(k => (
          <div key={k.id} className="row-item" style={{ alignItems: 'flex-start' }}>
            <span className={`dot ${k.due < today ? 'dot-red' : k.due <= new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10) ? 'dot-amber' : 'dot-green'}`} style={{ marginTop: 6 }} />
            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setKd(k)}>
              <div className="row-name">{k.name}</div>
              <div className="row-sub">{whenLabel(k.due, today)}{k.everyMonths ? ` · every ${k.everyMonths === 12 ? 'year' : `${k.everyMonths} months`}` : ''}{k.lastDone ? ` · last done ${fmtDate(k.lastDone)}` : ''}</div>
              {k.notes && <div className="row-sub">{k.notes}</div>}
            </div>
            <button className="done-btn" onClick={() => saveProp({ ...p, keyDates: p.keyDates.map(x => (x.id === k.id ? rollKeyDate(x, today) : x)) })}>Done</button>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>Money in and out · {year}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-add" onClick={() => setEntry(blankEntry('income'))}>+ Money in</button>
            <button className="btn-add" onClick={() => setEntry(blankEntry('cost'))}>+ Cost</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {!job?.running && <button className="btn-primary" onClick={readStatements}>Read {p.agent?.name ?? 'agent'} statements from email</button>}
          {!job?.running && (
            <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              Upload statements (PDF)
              <input type="file" accept="application/pdf" multiple style={{ display: 'none' }} onChange={e => { uploadStatements(e.target.files); e.target.value = ''; }} />
            </label>
          )}
          {!job?.running && missing.length > 0 && <button className="btn-primary" onClick={readAmounts}>Fill in {missing.length} missing amount{missing.length === 1 ? '' : 's'}</button>}
          {job?.running && <button className="btn-cancel" onClick={() => { stop.current = true; }}>Stop</button>}
        </div>
        {job && (
          <div style={{ marginBottom: 10 }}>
            <div className="row-sub" style={{ fontWeight: 600, color: 'var(--text)' }}>{job.title}</div>
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>{job.log.map((l, i) => <div key={i} className="row-sub">{l}</div>)}</div>
          </div>
        )}
        {sum.byCat.length > 0 && (
          <div className="row-sub" style={{ marginBottom: 8 }}>Costs: {sum.byCat.map(([c, v]) => `${c} ${fmtMoney(v)}`).join(' · ')}</div>
        )}
        {list.length === 0 && <div className="empty">Nothing in tax year {year} yet.</div>}
        {list.map(e => (
          <div key={e.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setEntry(e)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row-name">{e.supplier || e.category}</div>
              <div className="row-sub">{fmtDate(e.date)} · {e.category}{e.desc ? ` · ${e.desc}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
              <div style={{ fontWeight: 600, color: e.kind === 'income' ? 'var(--green)' : undefined }}>{e.amount ? `${e.kind === 'income' ? '+' : '−'}${fmtMoney(e.amount)}` : <span className="badge bg-red">No amount</span>}</div>
              {e.status === 'Outstanding' && <span className="badge bg-amber" style={{ fontSize: 10 }}>To pay</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="card hub-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Details</div>
          <button className="btn-add" onClick={() => setEditDetails(!editDetails)}>{editDetails ? 'Done' : 'Edit'}</button>
        </div>
        {!editDetails ? (
          <div style={{ marginTop: 8 }}>
            {p.agent && <div className="row-sub" style={{ color: 'var(--text)' }}>Agent: <b>{p.agent.name}</b>{p.agent.contact ? `, ${p.agent.contact}` : ''}{p.agent.phone ? ` · ${p.agent.phone}` : ''}{p.agent.email ? ` · ${p.agent.email}` : ''}{p.agent.address ? ` · ${p.agent.address}` : ''}</div>}
            {p.agent?.notes && <div className="row-sub">{p.agent.notes}</div>}
            {p.notes && <div className="row-sub" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{p.notes}</div>}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <label className="form-label">Name</label><input defaultValue={p.name} onBlur={e => saveProp({ ...p, name: e.target.value })} />
            <label className="form-label">Address</label><input defaultValue={p.address} onBlur={e => saveProp({ ...p, address: e.target.value })} />
            <div className="field-row">
              <div><label className="form-label">Owners</label><input defaultValue={p.owners} onBlur={e => saveProp({ ...p, owners: e.target.value })} /></div>
              <div><label className="form-label">Use</label><input defaultValue={p.use} onBlur={e => saveProp({ ...p, use: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div><label className="form-label">Agent</label><input defaultValue={p.agent?.name} onBlur={e => saveProp({ ...p, agent: { ...p.agent, name: e.target.value } })} /></div>
              <div><label className="form-label">Contact</label><input defaultValue={p.agent?.contact} onBlur={e => saveProp({ ...p, agent: { name: p.agent?.name ?? '', ...p.agent, contact: e.target.value } })} /></div>
            </div>
            <div className="field-row">
              <div><label className="form-label">Phone</label><input defaultValue={p.agent?.phone} onBlur={e => saveProp({ ...p, agent: { name: p.agent?.name ?? '', ...p.agent, phone: e.target.value } })} /></div>
              <div><label className="form-label">Email</label><input defaultValue={p.agent?.email} onBlur={e => saveProp({ ...p, agent: { name: p.agent?.name ?? '', ...p.agent, email: e.target.value } })} /></div>
            </div>
            <label className="form-label">Notes (meters, keys, mortgage, insurance…)</label>
            <textarea rows={5} defaultValue={p.notes} onBlur={e => saveProp({ ...p, notes: e.target.value })} />
          </div>
        )}
      </div>

      {entry && <EntryModal entry={entry} onSave={saveEntry} onClose={() => setEntry(null)}
        onDelete={p.entries.some(x => x.id === entry.id) ? () => { if (confirm('Delete this line?')) { saveProp({ ...p, entries: p.entries.filter(x => x.id !== entry.id) }); setEntry(null); } } : undefined} />}
      {kd && <KeyDateModal kd={kd} onSave={saveKd} onClose={() => setKd(null)}
        onDelete={p.keyDates.some(x => x.id === kd.id) ? () => { saveProp({ ...p, keyDates: p.keyDates.filter(x => x.id !== kd.id) }); setKd(null); } : undefined} />}
    </>
  );
}
