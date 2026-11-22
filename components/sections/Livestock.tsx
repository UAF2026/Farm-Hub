'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FarmData, Cattle } from '@/lib/types';
import { fmtDate } from '@/lib/utils';
import {
  buildHerd, Herd, HerdAnimal, HerdBase, HerdEdits, ADDED_ID_START,
  shortTag, label, pct, ageYears, ageLabel, matches, groupOf, Group, isBreedingBull,
  wagyuBand, BANDS, cowStats, CowStats, verdict, relation,
} from '@/lib/herd';

// Livestock: the whole herd history from Farmplan Cattle Manager (loaded once
// into Supabase via /api/herd) with James's corrections on top (data.herdEdits).
// Views: Herd (list + animal pages), Cows (performance / cull list),
// Bulling (inbreeding planner and groups), Sales (what left, weights, prices).

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }
type View = 'herd' | 'cows' | 'bulling' | 'sales';

const GROUP_TO_CATTLE_TYPE: Record<Group, string> = {
  Cow: 'Breeding cow', Heifer: 'Heifer', Calf: 'Calf', Bull: 'Bull', 'Young bull / steer': 'Young bull / steer', Other: 'Other',
};

/** The short on-farm list other tabs use (Dashboard count, Medicine tag list, Ask AI). */
function cattleFrom(h: Herd): Cattle[] {
  return h.animals.filter(a => a.on && !a.ref).map(a => {
    const dam = a.dam != null ? h.byId.get(a.dam) : undefined, sire = a.sire != null ? h.byId.get(a.sire) : undefined;
    const w = h.wagyu(a.id);
    return {
      tag: a.tag || label(a), type: GROUP_TO_CATTLE_TYPE[groupOf(h, a)],
      breed: w != null ? `Wagyu ${pct(w)}` : (a.breed || 'Unknown'), dob: a.dob,
      notes: [a.name, dam ? `Dam: ${label(dam)}` : '', sire ? `Sire: ${label(sire)}` : ''].filter(Boolean).join(' · '),
      source: 'Farmplan',
    };
  });
}

function seasonDefault(now = new Date()) { return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear(); }
const money = (v: number | null | undefined) => (v == null ? '—' : '£' + Math.round(v).toLocaleString('en-GB'));
const kg = (v: number | null | undefined) => (v == null ? '—' : Math.round(v) + ' kg');
const fullLabel = (a: HerdAnimal | undefined) => (!a ? '' : a.name ? `${a.name} (${a.tag || '#' + a.id})` : a.tag || `#${a.id}`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const sexWord = (s: string) => (s === 'F' ? 'Female' : s === 'M' ? 'Male' : s);

export default function Livestock({ db, persist, addActivity }: Props) {
  const [base, setBase] = useState<HerdBase | null>(null);
  const [state, setState] = useState<'loading' | 'empty' | 'ok' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [view, setView] = useState<View>('herd');
  const [openId, setOpenId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | 'new' | null>(null);

  useEffect(() => {
    fetch('/api/herd', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (j.error) { setErr(j.error); setState('error'); return; }
        if (j.empty) { setState('empty'); return; }
        setBase(j.base); setState('ok');
      })
      .catch(e => { setErr(String(e)); setState('error'); });
  }, []);

  const rawEdits = db.herdEdits;
  const edits: HerdEdits = useMemo(() => rawEdits || {}, [rawEdits]);
  const herd = useMemo(() => (base ? buildHerd(base, edits) : null), [base, edits]);

  // Keep the short on-farm list (db.cattle) in step with the herd records.
  useEffect(() => {
    if (!herd) return;
    const next = cattleFrom(herd);
    if (JSON.stringify(next) !== JSON.stringify(db.cattle || [])) persist({ ...db, cattle: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herd]);

  function saveEdits(next: HerdEdits, msg?: string) {
    const e2 = { ...next, updated: new Date().toISOString() };
    const h2 = base ? buildHerd(base, e2) : null;
    persist({ ...db, herdEdits: e2, ...(h2 ? { cattle: cattleFrom(h2) } : {}) });
    if (msg) addActivity(msg);
  }

  async function importFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const r = await fetch('/api/herd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: parsed }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setBase(parsed); setState('ok');
      addActivity(`Loaded Farmplan herd history: ${j.animals} animals`);
    } catch (e) { alert('Could not load that file: ' + (e instanceof Error ? e.message : String(e))); }
  }

  if (state === 'loading') return <div className="card"><div className="empty">Loading herd records…</div></div>;
  if (state === 'error') return <div className="card"><div className="card-title">Herd records</div><div className="empty">Couldn&apos;t load the herd records: {err}</div></div>;
  if (state === 'empty' || !herd) return (
    <div className="card hub-form">
      <div className="card-title">Load the Farmplan herd history</div>
      <p style={{ fontSize: 14, marginBottom: 12 }}>
        Pick the file <b>farmplan-herd-history.json</b> from the Farm Hub folder on your desktop. It holds every animal,
        calving, treatment, weight and sale from Farmplan Cattle Manager. You only need to do this once.
      </p>
      <input type="file" accept=".json,application/json" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
    </div>
  );

  const open = openId != null ? herd.byId.get(openId) : undefined;

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {([['herd', 'Herd'], ['cows', 'Cows'], ['bulling', 'Bulling'], ['sales', 'Sales']] as [View, string][]).map(([v, l]) => (
          <button key={v} className={`chip${view === v ? ' active' : ''}`} style={{ fontSize: 14, padding: '6px 14px' }} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view === 'herd' && <HerdView herd={herd} onOpen={setOpenId} onAdd={() => setEditId('new')} />}
      {view === 'cows' && <CowsView herd={herd} onOpen={setOpenId} />}
      {view === 'bulling' && <BullingView herd={herd} edits={edits} saveEdits={saveEdits} onOpen={setOpenId} />}
      {view === 'sales' && <SalesView herd={herd} onOpen={setOpenId} />}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        From {herd.base.source}. {edits.updated ? `Last change in the Hub ${fmtDate(edits.updated.slice(0, 10))}.` : ''}
      </p>

      {open && editId == null && (
        <AnimalModal herd={herd} a={open} edits={edits} onOpen={setOpenId} onClose={() => setOpenId(null)} onEdit={() => setEditId(open.id)} />
      )}
      {editId != null && (
        <EditModal
          herd={herd} edits={edits} a={editId === 'new' ? undefined : herd.byId.get(editId)}
          onClose={() => setEditId(null)}
          onSave={(next, msg, id) => { saveEdits(next, msg); setEditId(null); setOpenId(id); }}
        />
      )}
    </>
  );
}

/* ───────────────────────── Herd list ───────────────────────── */

function HerdView({ herd, onOpen, onAdd }: { herd: Herd; onOpen: (id: number) => void; onAdd: () => void }) {
  const [status, setStatus] = useState<'on' | 'left' | 'all'>('on');
  const [grp, setGrp] = useState<Group | 'All'>('All');
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [limit, setLimit] = useState(150);

  const real = herd.animals.filter(a => !a.ref);
  const onFarm = real.filter(a => a.on);
  const groups = useMemo(() => {
    const m = new Map<number, Group>();
    for (const a of real) m.set(a.id, groupOf(herd, a));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herd]);
  const count = (g: Group) => onFarm.filter(a => groups.get(a.id) === g).length;

  const cowsW = onFarm.filter(a => groups.get(a.id) === 'Cow').map(a => herd.wagyu(a.id)).filter((v): v is number => v != null);
  const bandCounts = BANDS.map(b => [b, onFarm.filter(a => wagyuBand(herd.wagyu(a.id)) === b).length] as [string, number]).filter(([, n]) => n);
  const maxBand = Math.max(1, ...bandCounts.map(([, n]) => n));

  // Home-bred calves per year with average Wagyu %
  const thisYear = new Date().getFullYear();
  const byYear: { y: number; n: number; w: number | null; on: number }[] = [];
  for (let y = thisYear; y >= thisYear - 13; y--) {
    const calves = real.filter(a => a.dob.startsWith(String(y)) && a.dam != null);
    if (!calves.length) continue;
    byYear.push({ y, n: calves.length, w: avg(calves.map(c => herd.wagyu(c.id)).filter((v): v is number => v != null)), on: calves.filter(c => c.on).length });
  }

  const years = Array.from(new Set(real.map(a => a.dob.slice(0, 4)).filter(Boolean))).sort().reverse();
  const list = real
    .filter(a => (status === 'all' ? true : status === 'on' ? a.on : !a.on))
    .filter(a => grp === 'All' || groups.get(a.id) === grp)
    .filter(a => !year || a.dob.startsWith(year))
    .filter(a => matches(a, q))
    .sort((a, b) => (status === 'left' ? (b.left || '').localeCompare(a.left || '') : b.dob.localeCompare(a.dob)));

  return (
    <>
      <div className="metric-grid">
        <Metric label="On farm" value={onFarm.length} />
        <Metric label="Cows" value={count('Cow')} sub={cowsW.length ? `avg ${pct(avg(cowsW), 0)} Wagyu` : ''} />
        <Metric label="Heifers" value={count('Heifer')} />
        <Metric label="Calves" value={count('Calf')} sub="under a year" />
        <Metric label="Young bulls / steers" value={count('Young bull / steer')} />
        <Metric label="Breeding bulls" value={count('Bull')} sub={onFarm.filter(a => groups.get(a.id) === 'Bull').map(a => a.name || shortTag(a)).join(', ')} />
      </div>

      <div className="grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <div className="card-title">On farm by Wagyu %</div>
          {bandCounts.map(([b, n]) => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
              <span style={{ width: 110 }}>{b}</span>
              <span style={{ flex: 1, background: 'var(--gray-mid)', borderRadius: 3, height: 10 }}>
                <span style={{ display: 'block', width: `${(n / maxBand) * 100}%`, background: 'var(--green)', height: 10, borderRadius: 3 }} />
              </span>
              <span style={{ width: 30, textAlign: 'right' }}>{n}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Calves born each year</div>
          <table className="hist-table">
            <thead><tr><th>Year</th><th>Calves</th><th>Avg Wagyu</th><th>Still here</th></tr></thead>
            <tbody>{byYear.map(r => <tr key={r.y}><td>{r.y}</td><td>{r.n}</td><td>{pct(r.w, 1)}</td><td>{r.on}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="card-title" style={{ margin: 0 }}>Animals ({list.length})</div>
          <button className="btn-add" onClick={onAdd}>+ Add animal</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {([['on', 'On farm'], ['left', 'Left farm'], ['all', 'All']] as const).map(([v, l]) => (
            <button key={v} className={`chip${status === v ? ' active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
          ))}
          <span style={{ width: 8 }} />
          {(['All', 'Cow', 'Heifer', 'Calf', 'Young bull / steer', 'Bull'] as const).map(g => (
            <button key={g} className={`chip${grp === g ? ' active' : ''}`} onClick={() => setGrp(g)}>{g}</button>
          ))}
        </div>
        <div className="hub-form" style={{ display: 'flex', gap: 8 }}>
          <input type="search" placeholder="Tag digits or name, e.g. 1467" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 2 }} />
          <select value={year} onChange={e => setYear(e.target.value)} style={{ flex: 1 }}>
            <option value="">Any year born</option>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        {list.length === 0 ? <div className="empty">No animals match.</div> : list.slice(0, limit).map(a => (
          <AnimalRow key={a.id} herd={herd} a={a} group={groups.get(a.id)!} onOpen={onOpen} />
        ))}
        {list.length > limit && <button className="btn-cancel" style={{ marginTop: 10 }} onClick={() => setLimit(limit + 300)}>Show more ({list.length - limit} more)</button>}
      </div>
    </>
  );
}

function Metric({ label: l, value, sub }: { label: string; value: number | string; sub?: string }) {
  return <div className="metric-card"><div className="metric-label">{l}</div><div className="metric-value">{value}</div>{sub ? <div className="metric-sub">{sub}</div> : null}</div>;
}

function AnimalRow({ herd, a, group, onOpen, extra }: { herd: Herd; a: HerdAnimal; group?: Group; onOpen: (id: number) => void; extra?: React.ReactNode }) {
  const w = herd.wagyu(a.id);
  const sire = a.sire != null ? herd.byId.get(a.sire) : undefined;
  return (
    <div className="row-item" style={{ cursor: 'pointer' }} onClick={() => onOpen(a.id)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-name">{shortTag(a)}{a.name ? <span style={{ fontWeight: 400 }}> · {a.name}</span> : null}</div>
        <div className="row-sub">
          {sexWord(a.sex)} · {a.dob ? `${fmtDate(a.dob)} (${ageLabel(a.dob)})` : 'DOB unknown'}
          {sire ? ` · by ${label(sire)}` : ''}
          {!a.on && a.left ? ` · left ${fmtDate(a.left)}${a.to ? ' to ' + a.to : ''}` : ''}
        </div>
        {extra}
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
        <span className="badge bg-green">{pct(w)}</span>
        {group && a.on && <span className="badge bg-blue">{group}</span>}
        {!a.on && <span className="badge bg-gray">Gone</span>}
      </div>
    </div>
  );
}

/* ───────────────────────── Animal page ───────────────────────── */

function AnimalModal({ herd, a, edits, onOpen, onClose, onEdit }: { herd: Herd; a: HerdAnimal; edits: HerdEdits; onOpen: (id: number) => void; onClose: () => void; onEdit: () => void }) {
  const [allTreat, setAllTreat] = useState(false);
  const dam = a.dam != null ? herd.byId.get(a.dam) : undefined;
  const sire = a.sire != null ? herd.byId.get(a.sire) : undefined;
  const w = herd.wagyu(a.id);
  const f = herd.inbreeding(a.id);
  const kids = (herd.children.get(a.id) || []).slice().sort((x, y) => y.dob.localeCompare(x.dob));
  const cs = a.sex === 'F' ? cowStats(herd, a) : null;
  const treat = (herd.treatments.get(a.id) || []).slice().sort((x, y) => y.d.localeCompare(x.d));
  const wts = (herd.weights.get(a.id) || []).slice().sort((x, y) => y.d.localeCompare(x.d));
  const groups = Object.entries(edits.bulling || {}).map(([yr, m]) => [yr, m[String(a.id)]] as [string, number | undefined]).filter(([, b]) => b != null);
  const Link = ({ x }: { x?: HerdAnimal }) => x ? <a href="#" onClick={e => { e.preventDefault(); onOpen(x.id); }} style={{ color: 'var(--green)' }}>{label(x)}</a> : <span>—</span>;
  const Fact = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div style={{ fontSize: 13, padding: '4px 0', display: 'flex', gap: 8 }}><span style={{ width: 120, color: 'var(--text-muted)', flexShrink: 0 }}>{k}</span><span>{children}</span></div>
  );

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div className="modal-title" style={{ marginBottom: 4 }}>{a.name ? `${a.name} · ` : ''}{a.tag || shortTag(a)}</div>
          <button className="del-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="badge bg-green">{pct(w)} Wagyu</span>
          <span className={`badge ${a.on ? 'bg-blue' : 'bg-gray'}`}>{a.on ? groupOf(herd, a) : 'Gone'}</span>
          {f > 0 && <span className={`badge ${verdict(f).cls}`}>{pct(f * 100)} inbred</span>}
          {a.added && <span className="badge bg-amber">Added in Hub</span>}
        </div>

        <Fact k="Born">{a.dob ? `${fmtDate(a.dob)} (${ageLabel(a.dob)})` : 'Unknown'}</Fact>
        <Fact k="Sex">{sexWord(a.sex)}</Fact>
        <Fact k="Breed (Farmplan)">{a.breed || '—'}</Fact>
        <Fact k="Dam"><Link x={dam} />{dam ? ` · ${pct(herd.wagyu(dam.id))}` : ''}</Fact>
        <Fact k="Sire"><Link x={sire} />{sire ? ` · ${pct(herd.wagyu(sire.id))}` : ''}</Fact>
        <Fact k="Wagyu %">{pct(w, 2)} <span style={{ color: 'var(--text-muted)' }}>({herd.wagyuHow(a.id)})</span></Fact>
        {a.from && <Fact k="Bought in">{a.from}{a.arrived ? `, ${fmtDate(a.arrived)}` : ''}{a.bought ? `, ${money(a.bought)}` : ''}</Fact>}
        {!a.on && <Fact k="Left farm">{a.left ? fmtDate(a.left) : 'date not recorded'}{a.to ? ` → ${a.to}` : ''}{a.dw ? ` · ${kg(a.dw)} dw` : ''}{a.price ? ` · ${money(a.price)}` : ''}{a.left && a.dob ? ` · aged ${Math.round((ageYears(a.dob, new Date(a.left + 'T12:00:00')) || 0) * 12)} months` : ''}</Fact>}
        {groups.map(([yr, b]) => <Fact key={yr} k={`Bulling ${yr}`}>{label(herd.byId.get(b!))}</Fact>)}
        {a.notes && <Fact k="Notes">{a.notes}</Fact>}

        {cs && cs.calvings.length > 0 && (
          <>
            <div className="card-title" style={{ marginTop: 16, marginBottom: 6 }}>Calvings ({cs.calvings.length})</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              First calved at {cs.firstCalvingAgeMonths ?? '—'} months · average interval {cs.avgInterval ? `${cs.avgInterval} days` : '—'}{cs.missedYears ? ` · ${cs.missedYears} missed year${cs.missedYears > 1 ? 's' : ''}` : ''}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="hist-table">
                <thead><tr><th>Calved</th><th>Calf</th><th>Sex</th><th>Sire</th><th>Wagyu</th><th>Inbred</th><th>Now</th></tr></thead>
                <tbody>{cs.calvings.slice().reverse().flatMap(c => c.calves.map(k => (
                  <tr key={k.id}>
                    <td>{fmtDate(c.date)}</td><td><Link x={k} /></td><td>{k.sex}</td><td>{c.sire ? label(c.sire) : '—'}</td>
                    <td>{pct(herd.wagyu(k.id))}</td><td>{herd.inbreeding(k.id) ? pct(herd.inbreeding(k.id) * 100) : '0'}</td>
                    <td>{k.on ? 'On farm' : `${k.to || 'Gone'}${k.dw ? ` ${kg(k.dw)}` : ''}`}</td>
                  </tr>
                )))}</tbody>
              </table>
            </div>
          </>
        )}

        {a.sex === 'M' && kids.length > 0 && (
          <>
            <div className="card-title" style={{ marginTop: 16, marginBottom: 6 }}>Calves sired ({kids.length})</div>
            <SiredSummary herd={herd} kids={kids} />
          </>
        )}

        {treat.length > 0 && (
          <>
            <div className="card-title" style={{ marginTop: 16, marginBottom: 6 }}>Treatments ({treat.length})</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="hist-table">
                <thead><tr><th>Date</th><th>Product</th><th>Reason</th><th>Qty</th></tr></thead>
                <tbody>{(allTreat ? treat : treat.slice(0, 8)).map((t, i) => <tr key={i}><td>{fmtDate(t.d)}</td><td>{t.p}</td><td>{t.r}</td><td>{t.q || ''}</td></tr>)}</tbody>
              </table>
            </div>
            {treat.length > 8 && !allTreat && <button className="btn-cancel" style={{ marginTop: 6 }} onClick={() => setAllTreat(true)}>Show all {treat.length}</button>}
          </>
        )}

        {wts.length > 0 && (
          <>
            <div className="card-title" style={{ marginTop: 16, marginBottom: 6 }}>Weights</div>
            <div style={{ fontSize: 13 }}>{wts.map((x, i) => <span key={i} style={{ marginRight: 12 }}>{fmtDate(x.d)}: <b>{x.w} kg</b></span>)}</div>
          </>
        )}

        <div className="modal-btns" style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={onEdit}>Edit / correct</button>
          <button className="btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function SiredSummary({ herd, kids }: { herd: Herd; kids: HerdAnimal[] }) {
  const byYear = new Map<string, HerdAnimal[]>();
  for (const k of kids) { const y = k.dob.slice(0, 4) || '?'; if (!byYear.has(y)) byYear.set(y, []); byYear.get(y)!.push(k); }
  return (
    <table className="hist-table">
      <thead><tr><th>Year</th><th>Calves</th><th>Avg Wagyu</th><th>Avg inbred</th><th>On farm</th></tr></thead>
      <tbody>{Array.from(byYear.entries()).map(([y, ks]) => (
        <tr key={y}><td>{y}</td><td>{ks.length}</td>
          <td>{pct(avg(ks.map(k => herd.wagyu(k.id)).filter((v): v is number => v != null)))}</td>
          <td>{pct((avg(ks.map(k => herd.inbreeding(k.id))) || 0) * 100)}</td>
          <td>{ks.filter(k => k.on).length}</td></tr>
      ))}</tbody>
    </table>
  );
}

/* ───────────────────────── Edit / add ───────────────────────── */

function EditModal({ herd, edits, a, onClose, onSave }: {
  herd: Herd; edits: HerdEdits; a?: HerdAnimal; onClose: () => void;
  onSave: (next: HerdEdits, msg: string, id: number) => void;
}) {
  const isNew = !a;
  const [tag, setTag] = useState(a?.tag || 'UK 283762 ');
  const [name, setName] = useState(a?.name || '');
  const [dob, setDob] = useState(a?.dob || '');
  const [sex, setSex] = useState(a?.sex || 'F');
  const initDam = a?.dam != null ? fullLabel(herd.byId.get(a.dam)) : '';
  const initSire = a?.sire != null ? fullLabel(herd.byId.get(a.sire)) : '';
  const [damTxt, setDamTxt] = useState(initDam);
  const [sireTxt, setSireTxt] = useState(initSire);
  const [on, setOn] = useState(a ? a.on : true);
  const [left, setLeft] = useState(a?.left || '');
  const [to, setTo] = useState(a?.to || '');
  const [dw, setDw] = useState(a?.dw ? String(a.dw) : '');
  const [price, setPrice] = useState(a?.price ? String(a.price) : '');
  const [wpct, setWpct] = useState(a?.wpct != null ? String(a.wpct) : '');
  const [bull, setBull] = useState(a?.bull === undefined ? '' : a.bull ? 'yes' : 'no');
  const [notes, setNotes] = useState(a?.notes || '');

  const real = herd.animals.filter(x => !x.ref || x.sex === 'M');
  const females = real.filter(x => x.sex === 'F' && (x.on || (x.left || '') >= '2010'));
  const males = herd.animals.filter(x => x.sex === 'M' && (x.ref || x.name || (herd.children.get(x.id) || []).some(c => c.sire === x.id) || x.on));
  const recent = (xs: HerdAnimal[]) => xs.slice().sort((p, q) => Number(q.on) - Number(p.on) || q.dob.localeCompare(p.dob));

  function resolve(txt: string, init: string, current: number | null | undefined, pool: HerdAnimal[]): number | null | 'bad' {
    const s = txt.trim();
    if (!s) return null;
    if (s === init && current != null) return current;   // unchanged
    const exact = pool.filter(x => fullLabel(x) === s);
    if (exact.length === 1) return exact[0].id;
    const hits = pool.filter(x => matches(x, s));
    if (hits.length === 1) return hits[0].id;
    const onFarm = hits.filter(x => x.on);
    return onFarm.length === 1 ? onFarm[0].id : 'bad';
  }

  function save() {
    const damId = resolve(damTxt, initDam, a?.dam, herd.animals.filter(x => x.sex === 'F'));
    const sireId = resolve(sireTxt, initSire, a?.sire, herd.animals.filter(x => x.sex === 'M'));
    if (damId === 'bad') return alert('Dam not found (or more than one match). Type more of the tag, or pick from the list.');
    if (sireId === 'bad') return alert('Sire not found (or more than one match). Type more of the tag, or pick from the list.');
    const cleanTag = tag.trim().toUpperCase().replace(/\s+/g, ' ');
    if (isNew && (!cleanTag || /^UK 283762$/.test(cleanTag))) return alert('Enter the full ear tag');
    const dup = herd.animals.find(x => x.tag.replace(/\s/g, '') === cleanTag.replace(/\s/g, '') && x.id !== a?.id);
    if (dup && cleanTag) return alert(`That tag is already on ${label(dup)}`);
    const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? undefined : Number(s));
    const fields: Partial<HerdAnimal> = {
      tag: cleanTag, name: name.trim(), dob, sex, dam: damId, sire: sireId, on,
      left: on ? undefined : left || undefined, to: on ? undefined : to.trim() || undefined,
      dw: on ? undefined : num(dw), price: on ? undefined : num(price),
      wpct: num(wpct) ?? null, bull: bull === '' ? undefined : bull === 'yes', notes: notes.trim() || undefined,
    };
    if (isNew) {
      const id = Math.max(ADDED_ID_START, ...herd.animals.map(x => x.id)) + 1;
      const animal: HerdAnimal = { id, breed: '', ref: false, hb: 1, ...fields } as HerdAnimal;
      onSave({ ...edits, added: [...(edits.added || []), animal] }, `Added animal ${label(animal)}`, id);
      return;
    }
    // Store only what differs from the Farmplan original, so the original is never lost.
    const orig = herd.base.animals.find(x => x.id === a!.id);
    if (a!.added) {
      onSave({ ...edits, added: (edits.added || []).map(x => (x.id === a!.id ? { ...x, ...fields } : x)) }, `Edited ${label(a)}`, a!.id);
      return;
    }
    const diff: Record<string, unknown> = {};
    (Object.keys(fields) as (keyof HerdAnimal)[]).forEach(k => {
      const v = fields[k], o = orig?.[k];
      const same = (v ?? null) === (o ?? null) || (k === 'wpct' && v == null && o == null);
      if (!same) diff[k] = v === undefined ? null : v;
    });
    const all = { ...(edits.animals || {}) };
    if (Object.keys(diff).length) all[String(a!.id)] = diff as Partial<HerdAnimal>; else delete all[String(a!.id)];
    onSave({ ...edits, animals: all }, `Edited ${label(a)}`, a!.id);
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-title">{isNew ? 'Add animal' : `Edit ${label(a)}`}</div>
        <datalist id="herd-dams">{recent(females).slice(0, 400).map(x => <option key={x.id} value={fullLabel(x)} />)}</datalist>
        <datalist id="herd-sires">{recent(males).map(x => <option key={x.id} value={fullLabel(x)} />)}</datalist>
        <label className="form-label">Ear tag</label>
        <input value={tag} onChange={e => setTag(e.target.value)} placeholder="UK 283762 ..." />
        <label className="form-label">Name (optional)</label>
        <input value={name} onChange={e => setName(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label className="form-label">Born</label><input type="date" value={dob} onChange={e => setDob(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="form-label">Sex</label>
            <select value={sex} onChange={e => setSex(e.target.value)}><option value="F">Female</option><option value="M">Male</option></select></div>
        </div>
        <label className="form-label">Dam (type tag digits)</label>
        <input list="herd-dams" value={damTxt} onChange={e => setDamTxt(e.target.value)} placeholder="e.g. 301373" />
        <label className="form-label">Sire (type tag digits or name)</label>
        <input list="herd-sires" value={sireTxt} onChange={e => setSireTxt(e.target.value)} placeholder="e.g. Tanaka" />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '4px 0 10px' }}>
          <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} style={{ width: 'auto', margin: 0 }} /> On the farm now
        </label>
        {!on && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><label className="form-label">Left farm</label><input type="date" value={left} onChange={e => setLeft(e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="form-label">Went to</label><input value={to} onChange={e => setTo(e.target.value)} placeholder="Dovecote, Thame…" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><label className="form-label">Deadweight kg</label><input inputMode="decimal" value={dw} onChange={e => setDw(e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="form-label">Price £</label><input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label className="form-label">Wagyu % (blank = work out)</label><input inputMode="decimal" value={wpct} onChange={e => setWpct(e.target.value)} placeholder={a ? pct(herd.wagyu(a.id)) : ''} /></div>
          {sex === 'M' && <div style={{ flex: 1 }}><label className="form-label">Breeding bull?</label>
            <select value={bull} onChange={e => setBull(e.target.value)}><option value="">Work it out</option><option value="yes">Yes</option><option value="no">No</option></select></div>}
        </div>
        <label className="form-label">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="modal-btns">
          <button className="btn-primary" onClick={save}>Save</button>
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Cows ───────────────────────── */

function CowsView({ herd, onOpen }: { herd: Herd; onOpen: (id: number) => void }) {
  const [sort, setSort] = useState<'flags' | 'wagyu' | 'age' | 'interval'>('flags');
  const stats = useMemo(() => herd.animals
    .filter(a => a.on && a.sex === 'F' && !a.ref && (groupOf(herd, a) === 'Cow' || (ageYears(a.dob) || 0) >= 3))
    .map(a => cowStats(herd, a)), [herd]);

  const sorted = stats.slice().sort((x, y) => {
    if (sort === 'flags') return y.flags.length - x.flags.length || (y.age || 0) - (x.age || 0);
    if (sort === 'wagyu') return (y.wagyu ?? -1) - (x.wagyu ?? -1);
    if (sort === 'age') return (y.age || 0) - (x.age || 0);
    return (y.avgInterval || 0) - (x.avgInterval || 0);
  });

  // Last calving season summary
  const now = new Date();
  const season = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const calvedThis = stats.filter(s => s.lastCalved.startsWith(String(season)));
  const dates = calvedThis.map(s => s.calvings.find(c => c.date.startsWith(String(season)))!.date).sort();
  const start = dates[0];
  const in6 = start ? dates.filter(d => (new Date(d).getTime() - new Date(start).getTime()) / 864e5 <= 42).length : 0;
  const intervals = stats.map(s => s.avgInterval).filter((v): v is number => v != null);
  const cull = stats.filter(s => s.flags.length);

  return (
    <>
      <div className="metric-grid">
        <Metric label="Cows & older heifers" value={stats.length} />
        <Metric label={`Calved in ${season}`} value={calvedThis.length} sub={stats.length ? `${Math.round((calvedThis.length / stats.length) * 100)}% of them` : ''} />
        <Metric label={`${season} calving spread`} value={start ? `${fmtDate(dates[0]).replace(/ \d{4}$/, '')} – ${fmtDate(dates[dates.length - 1]).replace(/ \d{4}$/, '')}` : '—'} sub={dates.length ? `${Math.round((in6 / dates.length) * 100)}% in first 6 weeks` : ''} />
        <Metric label="Avg calving interval" value={intervals.length ? `${Math.round(avg(intervals)!)} d` : '—'} sub="target 365" />
        <Metric label="Worth a look" value={cull.length} sub="flagged below" />
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Cow performance</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['flags', 'Flagged first'], ['wagyu', 'Wagyu %'], ['age', 'Oldest'], ['interval', 'Longest interval']] as const).map(([v, l]) => (
              <button key={v} className={`chip${sort === v ? ' active' : ''}`} onClick={() => setSort(v)}>{l}</button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Flags: 12 years or older, no calf in the latest season, last calving interval over 425 days, 2+ missed years, or 3+ years old and never calved. They are prompts to check, not decisions. Calves still to be entered will show as missed.
        </p>
        {sorted.map(s => <CowRow key={s.cow.id} herd={herd} s={s} onOpen={onOpen} />)}
      </div>
    </>
  );
}

function CowRow({ herd, s, onOpen }: { herd: Herd; s: CowStats; onOpen: (id: number) => void }) {
  return (
    <AnimalRow herd={herd} a={s.cow} onOpen={onOpen} extra={
      <>
        <div className="row-sub">
          {s.calvings.length} calving{s.calvings.length === 1 ? '' : 's'}
          {s.lastCalved ? ` · last ${fmtDate(s.lastCalved)}` : ''}
          {s.avgInterval ? ` · avg interval ${s.avgInterval} d` : ''}
          {s.firstCalvingAgeMonths ? ` · first at ${s.firstCalvingAgeMonths} mo` : ''}
          {s.avgCalfDw ? ` · calves avg ${kg(s.avgCalfDw)} dw` : ''}
        </div>
        {s.flags.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{s.flags.map(f => <span key={f} className="badge bg-amber">{f}</span>)}</div>}
      </>
    } />
  );
}

/* ───────────────────────── Bulling ───────────────────────── */

function BullingView({ herd, edits, saveEdits, onOpen }: { herd: Herd; edits: HerdEdits; saveEdits: (e: HerdEdits, msg?: string) => void; onOpen: (id: number) => void }) {
  const [season, setSeason] = useState(seasonDefault());
  const [onlyOpen, setOnlyOpen] = useState(false);
  const bulls = herd.animals.filter(a => isBreedingBull(herd, a)).sort((a, b) => (herd.wagyu(b.id) ?? 0) - (herd.wagyu(a.id) ?? 0));
  const bullingDate = new Date(season, 5, 1);
  const cows = herd.animals
    .filter(a => a.on && a.sex === 'F' && !a.ref && a.dob && (ageYears(a.dob, bullingDate) || 0) >= 13 / 12)
    .sort((a, b) => a.dob.localeCompare(b.dob));
  const groups = edits.bulling?.[String(season)] || {};

  const rows = useMemo(() => cows.map(c => {
    const per = bulls.map(b => ({ b, f: herd.kinship(b.id, c.id) }));
    const best = per.slice().sort((x, y) => x.f - y.f || (herd.wagyu(y.b.id) ?? 0) - (herd.wagyu(x.b.id) ?? 0))[0];
    return { c, per, best };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [herd, season, bulls.map(b => b.id).join()]);

  function assign(cowId: number, bullId: string) {
    const g = { ...groups };
    if (bullId) g[String(cowId)] = Number(bullId); else delete g[String(cowId)];
    saveEdits({ ...edits, bulling: { ...(edits.bulling || {}), [String(season)]: g } });
  }
  function fillSuggestions() {
    const g = { ...groups };
    let n = 0;
    for (const r of rows) if (r.best && g[String(r.c.id)] == null) { g[String(r.c.id)] = r.best.b.id; n++; }
    saveEdits({ ...edits, bulling: { ...(edits.bulling || {}), [String(season)]: g } }, `Bulling ${season}: filled ${n} cows with the suggested bull`);
  }

  const assignedAvoid = rows.filter(r => { const b = groups[String(r.c.id)]; return b != null && herd.kinship(b, r.c.id) >= 0.125; });
  const shown = onlyOpen ? rows.filter(r => groups[String(r.c.id)] == null) : rows;

  // History: inbred calves by year since 2013
  const thisYear = new Date().getFullYear();
  const hist: { y: number; n: number; c: number; a: number }[] = [];
  for (let y = 2013; y <= thisYear; y++) {
    const calves = herd.animals.filter(a => a.dob.startsWith(String(y)) && a.dam != null);
    if (!calves.length) continue;
    const fs = calves.map(k => herd.inbreeding(k.id));
    hist.push({ y, n: calves.length, c: fs.filter(f => f >= 0.0625 && f < 0.125).length, a: fs.filter(f => f >= 0.125).length });
  }

  return (
    <>
      <div className="card hub-form">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>Bulling season (summer)</span>
          <select value={season} onChange={e => setSeason(Number(e.target.value))} style={{ width: 'auto', margin: 0 }}>
            {[seasonDefault() + 1, seasonDefault(), seasonDefault() - 1, seasonDefault() - 2].map(y => <option key={y} value={y}>{y} (calves {y + 1})</option>)}
          </select>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
          Each box is how inbred the calf would be with that bull: <span className="badge bg-green">OK</span> under 6.25%, <span className="badge bg-amber">Caution</span> 6.25–12.5%, <span className="badge bg-red">Avoid</span> 12.5%+ (e.g. bull to his own daughter is 25%).
          Pick a bull for each cow to record the group, and the calves get an expected sire. Ancestors missing from Farmplan count as unrelated, so the real figure can be a bit higher.
        </p>
      </div>

      <div className="metric-grid">
        {bulls.map(b => {
          const n = Object.values(groups).filter(x => x === b.id).length;
          return <Metric key={b.id} label={label(b)} value={n} sub={`${pct(herd.wagyu(b.id))} Wagyu · cows in group`} />;
        })}
        <Metric label="Not yet in a group" value={rows.filter(r => groups[String(r.c.id)] == null).length} sub={`of ${rows.length} cows & heifers`} />
      </div>
      {assignedAvoid.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <b style={{ color: 'var(--red)' }}>{assignedAvoid.length} cow{assignedAvoid.length > 1 ? 's are' : ' is'} in an Avoid group:</b>{' '}
          {assignedAvoid.map(r => shortTag(r.c)).join(', ')}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Cows and heifers ({rows.length})</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`chip${onlyOpen ? ' active' : ''}`} onClick={() => setOnlyOpen(!onlyOpen)}>Not in a group</button>
            <button className="btn-primary" onClick={fillSuggestions}>Fill blanks with suggestions</button>
          </div>
        </div>
        {bulls.length === 0 && <div className="empty">No breeding bulls on farm. Mark one as a breeding bull from his page.</div>}
        {shown.map(({ c, per, best }) => {
          const chosen = groups[String(c.id)];
          return (
            <div key={c.id} className="row-item" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px', minWidth: 0, cursor: 'pointer' }} onClick={() => onOpen(c.id)}>
                <div className="row-name">{shortTag(c)}{c.name ? ` · ${c.name}` : ''}</div>
                <div className="row-sub">{pct(herd.wagyu(c.id))} · {ageLabel(c.dob)} · {groupOf(herd, c)}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: '2 1 260px' }}>
                {per.map(({ b, f }) => {
                  const v = verdict(f);
                  const calfW = herd.wagyu(b.id) != null && herd.wagyu(c.id) != null ? (herd.wagyu(b.id)! + herd.wagyu(c.id)!) / 2 : null;
                  return (
                    <span key={b.id} className={`badge ${v.cls}`} title={relation(herd, b.id, c.id)} style={{ outline: chosen === b.id ? '2px solid var(--text)' : 'none' }}>
                      {b.name || shortTag(b)}: {pct(f * 100)} {v.label}{calfW != null ? ` · calf ${pct(calfW)}` : ''}
                    </span>
                  );
                })}
              </div>
              <select className="hub-form" value={chosen ?? ''} onChange={e => assign(c.id, e.target.value)} style={{ flex: '0 0 160px', padding: '6px 8px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <option value="">— group —</option>
                {bulls.map(b => <option key={b.id} value={b.id}>{b.name || shortTag(b)}{best && best.b.id === b.id ? ' (suggested)' : ''}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">Inbred calves born each year</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="hist-table">
            <thead><tr><th>Year</th><th>Calves</th><th>Caution (6.25%+)</th><th>Avoid (12.5%+)</th></tr></thead>
            <tbody>{hist.slice().reverse().map(r => <tr key={r.y}><td>{r.y}</td><td>{r.n}</td><td>{r.c || ''}</td><td>{r.a || ''}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Sales ───────────────────────── */

function SalesView({ herd, onOpen }: { herd: Herd; onOpen: (id: number) => void }) {
  const [by, setBy] = useState<'year' | 'to' | 'wagyu'>('year');
  const gone = herd.animals.filter(a => !a.on && !a.ref && a.left);
  const dwYears = new Map<string, number>();
  for (const a of gone) if (a.dw) dwYears.set(a.left!.slice(0, 4), (dwYears.get(a.left!.slice(0, 4)) || 0) + 1);
  const lastDw = Array.from(dwYears.entries()).filter(([, n]) => n >= 5).map(([y]) => y).sort().pop();

  const key = (a: HerdAnimal) => by === 'year' ? a.left!.slice(0, 4) : by === 'to' ? (a.to || 'Not recorded') : wagyuBand(herd.wagyu(a.id));
  const groups = new Map<string, HerdAnimal[]>();
  for (const a of gone) { const k = key(a); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(a); }
  let entries = Array.from(groups.entries());
  if (by === 'year') entries.sort((x, y) => y[0].localeCompare(x[0]));
  else if (by === 'to') entries.sort((x, y) => y[1].length - x[1].length);
  else entries.sort((x, y) => BANDS.indexOf(x[0]) - BANDS.indexOf(y[0]));
  if (by === 'to') entries = entries.slice(0, 30);

  const recent = gone.slice().sort((a, b) => b.left!.localeCompare(a.left!)).slice(0, 40);

  return (
    <>
      <div className="card" style={{ background: 'var(--green-pale)' }}>
        <p style={{ fontSize: 13, margin: 0 }}>
          Farmplan has deadweights and prices for most cattle up to {lastDw || '2013'}; after that it mostly records only where each animal went.
          To build the Wagyu % vs deadweight and price picture, add the kill sheet figures to each animal (open it, then Edit). Dovecote kill sheets are the next thing worth loading.
        </p>
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Cattle that left the farm ({gone.length})</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['year', 'By year'], ['to', 'By buyer'], ['wagyu', 'By Wagyu %']] as const).map(([v, l]) => (
              <button key={v} className={`chip${by === v ? ' active' : ''}`} onClick={() => setBy(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="hist-table">
            <thead><tr><th>{by === 'year' ? 'Year' : by === 'to' ? 'Went to' : 'Wagyu %'}</th><th>Head</th><th>Avg age</th><th>Avg Wagyu</th><th>With dw</th><th>Avg dw</th><th>Avg £</th><th>£/kg</th></tr></thead>
            <tbody>{entries.map(([k, xs]) => {
              const ages = xs.filter(a => a.dob).map(a => (ageYears(a.dob, new Date(a.left! + 'T12:00:00')) || 0) * 12);
              const ws = xs.map(a => herd.wagyu(a.id)).filter((v): v is number => v != null);
              const dws = xs.filter(a => a.dw).map(a => a.dw!);
              const pr = xs.filter(a => a.price).map(a => a.price!);
              const both = xs.filter(a => a.dw && a.price);
              const ppk = both.length ? both.reduce((s, a) => s + a.price!, 0) / both.reduce((s, a) => s + a.dw!, 0) : null;
              return (
                <tr key={k}><td>{k}</td><td>{xs.length}</td><td>{ages.length ? `${Math.round(avg(ages)!)} mo` : '—'}</td><td>{pct(avg(ws), 1)}</td>
                  <td>{dws.length || ''}</td><td>{kg(avg(dws))}</td><td>{money(avg(pr))}</td><td>{ppk ? '£' + ppk.toFixed(2) : '—'}</td></tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Most recent to leave</div>
        {recent.map(a => <AnimalRow key={a.id} herd={herd} a={a} onOpen={onOpen} />)}
      </div>
    </>
  );
}
