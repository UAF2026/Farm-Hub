'use client';

import { useMemo, useState } from 'react';
import type { FarmData, Task } from '@/lib/types';
import {
  buildAgenda, applyAction, whenLabel, todayISO, addDaysISO, fmt,
  AgendaItem, AgendaAction, SOURCE_LABEL,
} from '@/lib/secretary';
import { useWeather } from './Weather';
import { workabilityHint } from '@/lib/weather';
import { uid } from '@/lib/utils';
import { parseJob, splitJobs } from '@/lib/quickparse';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  addActivity: (msg: string) => void;
}

const SOURCE_COLOUR: Record<string, string> = {
  task: 'var(--blue)', bill: 'var(--red)', invoice: 'var(--green)', certificate: 'var(--amber)',
  contract: 'var(--amber)', service: '#6b5ba8', agreement: '#8a5a2b', scheme: '#2b7a8a', routine: '#4a7c43',
};
const PRIMARY_LABEL: Partial<Record<AgendaAction, string>> = { done: 'Done', paid: 'Paid' };
const money = (n?: number) => (n ? `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '');

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function MyDay({ db, persist, addActivity }: Props) {
  const today = todayISO();
  const agenda = useMemo(() => buildAgenda(db, today), [db, today]);
  const weather = useWeather();
  const [catchUp, setCatchUp] = useState(false);
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const [toast, setToast] = useState('');

  function act(item: AgendaItem, action: AgendaAction, snoozeDays = 7) {
    persist(applyAction(db, item, action, snoozeDays, today));
    const what = action === 'paid' ? 'marked paid' : action === 'done' ? 'done' : action === 'snooze' ? `snoozed ${snoozeDays === 1 ? 'until tomorrow' : snoozeDays === 7 ? 'for a week' : 'for a month'}` : 'cleared';
    if (action === 'paid' || action === 'done') addActivity(`${item.title}: ${what}`);
    setToast(`${item.title} ${what}`);
    setTimeout(() => setToast(''), 2500);
  }

  const goodDays = (weather.data?.forecast || []).filter(f => workabilityHint(f).tone === 'good')
    .map(f => (f.date === today ? 'today' : new Date(f.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })));
  const owed = agenda.overdue.filter(i => i.source === 'bill').reduce((a, i) => a + (i.amount || 0), 0);

  if (catchUp) {
    return <CatchUp items={agenda.overdue} onAct={act} onClose={() => setCatchUp(false)} today={today} />;
  }

  const overdueShown = showAllOverdue ? agenda.overdue : agenda.overdue.slice(0, 5);

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>{greeting()}, James</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
          {agenda.today.length} today · {agenda.week.length} this week · {agenda.overdue.length} overdue
        </div>
        {goodDays.length > 0 && (
          <div style={{ fontSize: 13, marginTop: 6 }}>🌤️ Dry, calm days ahead: <strong>{goodDays.join(', ')}</strong>. Check hourly before spraying.</div>
        )}
      </div>

      <QuickAdd db={db} persist={persist} addActivity={addActivity} today={today} />
      <MyJobs db={db} persist={persist} addActivity={addActivity} today={today} />

      {agenda.overdue.length > 5 && (
        <div className="card hub-form" style={{ borderLeft: '4px solid var(--red)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{agenda.overdue.length} things are overdue{owed ? `, including ${money(owed)} of bills` : ''}.</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            Many may already be done or paid. Go through them one at a time: tap Paid, Done, Snooze or Not needed. It takes about 10–15 minutes and then this list can be trusted.
          </div>
          <button className="btn-primary" onClick={() => setCatchUp(true)}>Catch up now →</button>
        </div>
      )}

      <Group title="Overdue" tone="var(--red)" items={overdueShown} total={agenda.overdue.length} onAct={act} today={today}
        more={!showAllOverdue && agenda.overdue.length > 5 ? () => setShowAllOverdue(true) : undefined} />
      <Group title="Today" tone="var(--green)" items={agenda.today} total={agenda.today.length} onAct={act} today={today}
        empty="Nothing due today." />
      <Group title="This week" tone="var(--blue)" items={agenda.week} total={agenda.week.length} onAct={act} today={today}
        empty="Nothing else due this week." />
      <Group title="Coming up" tone="var(--text-muted)" items={showLater ? agenda.later : agenda.later.slice(0, 5)} total={agenda.later.length} onAct={act} today={today}
        more={!showLater && agenda.later.length > 5 ? () => setShowLater(true) : undefined} empty="Nothing on the horizon." />

      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0.5rem 0 1rem', lineHeight: 1.6 }}>
        Pulled together from Tasks, Finance, certificates, contracts, machinery, agreements, scheme deadlines and your Farm year.
        {agenda.snoozedCount ? ` ${agenda.snoozedCount} snoozed item${agenda.snoozedCount === 1 ? '' : 's'} will come back when due.` : ''}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ─── A group of items ─────────────────────────────────────────────────── */

function Group({ title, tone, items, total, onAct, today, more, empty }: {
  title: string; tone: string; items: AgendaItem[]; total: number; today: string;
  onAct: (i: AgendaItem, a: AgendaAction, days?: number) => void; more?: () => void; empty?: string;
}) {
  if (!total && !empty) return null;
  return (
    <div className="card hub-form">
      <div className="card-title" style={{ color: tone }}>{title}{total ? ` (${total})` : ''}</div>
      {!total && <div className="empty">{empty}</div>}
      {items.map(it => <Item key={it.key} it={it} onAct={onAct} today={today} />)}
      {more && <button className="btn-cancel" style={{ marginTop: 8 }} onClick={more}>Show all {total}</button>}
    </div>
  );
}

function Item({ it, onAct, today }: { it: AgendaItem; onAct: (i: AgendaItem, a: AgendaAction, days?: number) => void; today: string }) {
  const [menu, setMenu] = useState(false);
  const primary = it.actions.find(a => a === 'done' || a === 'paid');
  const overdue = it.due < today;
  return (
    <div className="agenda-item">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="agenda-chip" style={{ background: SOURCE_COLOUR[it.source] }}>{SOURCE_LABEL[it.source]}</span>
          <span style={{ fontWeight: 500 }}>{it.title}</span>
          {it.amount ? <span style={{ fontWeight: 500 }}>{money(it.amount)}</span> : null}
          {it.important && <span title="Important" style={{ color: 'var(--amber)' }}>●</span>}
        </div>
        <div className="row-sub" style={{ color: overdue ? 'var(--red)' : undefined }}>
          {whenLabel(it.due, today)}{it.guessedDate ? ' (no due date on it, so 30 days from the bill)' : ''}
        </div>
        {it.detail && <div className="row-sub" style={{ marginTop: 2 }}>{it.detail}</div>}
      </div>
      <div className="agenda-actions">
        {primary && <button className="btn-add" onClick={() => onAct(it, primary)}>{PRIMARY_LABEL[primary]}</button>}
        {!primary && <button className="btn-add" onClick={() => onAct(it, 'dismiss')}>Handled</button>}
        <button className="btn-cancel" onClick={() => setMenu(m => !m)} aria-expanded={menu}>More</button>
        {menu && (
          <div className="agenda-menu">
            <button onClick={() => { setMenu(false); onAct(it, 'snooze', 1); }}>Snooze till tomorrow</button>
            <button onClick={() => { setMenu(false); onAct(it, 'snooze', 7); }}>Snooze a week</button>
            <button onClick={() => { setMenu(false); onAct(it, 'snooze', 30); }}>Snooze a month</button>
            {primary && <button onClick={() => { setMenu(false); onAct(it, 'dismiss'); }}>Not needed</button>}
            <button onClick={() => { setMenu(false); window.location.hash = it.section; }}>Open where it lives</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Catch-up: one overdue item at a time ─────────────────────────────── */

function CatchUp({ items, onAct, onClose, today }: {
  items: AgendaItem[]; today: string; onAct: (i: AgendaItem, a: AgendaAction, days?: number) => void; onClose: () => void;
}) {
  // Freeze the list when catch-up starts so cards don't jump as items are cleared.
  const [queue] = useState(items);
  const [pos, setPos] = useState(0);
  const [cleared, setCleared] = useState(0);
  const it = queue[pos];
  const next = (didSomething: boolean) => { if (didSomething) setCleared(c => c + 1); setPos(p => p + 1); };

  if (!it) {
    return (
      <div className="card hub-form" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)', marginBottom: 6 }}>All caught up</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>You sorted {cleared} of {queue.length}. Anything you left is still on the list.</div>
        <button className="btn-primary" onClick={onClose}>Back to my day</button>
      </div>
    );
  }
  const primary = it.actions.find(a => a === 'done' || a === 'paid');
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button className="btn-cancel" onClick={onClose}>← Stop</button>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{pos + 1} of {queue.length} · {cleared} sorted</div>
      </div>
      <div className="progress"><div style={{ width: `${(pos / queue.length) * 100}%` }} /></div>
      <div className="card catchup-card">
        <span className="agenda-chip" style={{ background: SOURCE_COLOUR[it.source] }}>{SOURCE_LABEL[it.source]}</span>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 20, margin: '10px 0 4px' }}>{it.title}</div>
        {it.amount ? <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>{money(it.amount)}</div> : null}
        <div style={{ fontSize: 13, color: 'var(--red)' }}>{whenLabel(it.due, today)}{it.guessedDate ? ' (no due date on it)' : ''}</div>
        {it.detail && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>{it.detail}</div>}
        <div className="catchup-buttons">
          {primary
            ? <button className="btn-primary" onClick={() => { onAct(it, primary); next(true); }}>{primary === 'paid' ? (it.source === 'invoice' ? 'They’ve paid' : 'Already paid') : 'Already done'}</button>
            : <button className="btn-primary" onClick={() => { onAct(it, 'dismiss'); next(true); }}>Handled</button>}
          <button className="btn-add" onClick={() => next(false)}>Still to do</button>
          <button className="btn-cancel" onClick={() => { onAct(it, 'snooze', 7); next(true); }}>Snooze a week</button>
          <button className="btn-cancel" onClick={() => { onAct(it, 'dismiss'); next(true); }}>Not needed / not mine</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        “Still to do” leaves it on your list. Nothing is deleted: paid bills move to Paid in Finance, done tasks to Completed.
      </div>
    </>
  );
}

/* ─── Quick add: jot one job or paste a whole list ───────────────────────── */

function QuickAdd({ db, persist, addActivity, today }: { db: FarmData; persist: (d: FarmData) => void; addActivity: (m: string) => void; today: string }) {
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');          // '' = no date, like a paper list
  const chips: [string, string][] = [['No date', ''], ['Today', today], ['Tomorrow', addDaysISO(today, 1)], ['Next week', addDaysISO(today, 7)]];
  const jobs = splitJobs(text).map(line => parseJob(line, today));

  function add() {
    if (!jobs.length) return;
    const tasks: Task[] = jobs.map(j => ({
      id: uid(), name: j.name, date: j.date || when, priority: 'Medium', category: 'My jobs',
      repeat: 'No repeat', notes: '', done: false, doneDate: null,
    }));
    persist({ ...db, tasks: [...tasks, ...(db.tasks || [])] });
    addActivity(tasks.length === 1 ? `Added job: ${tasks[0].name}` : `Added ${tasks.length} jobs`);
    setText('');
    setWhen('');
  }

  return (
    <div className="card hub-form" style={{ padding: '0.9rem' }}>
      <textarea
        value={text} rows={Math.min(8, Math.max(1, text.split('\n').length))}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !text.includes('\n')) { e.preventDefault(); add(); } }}
        placeholder="Jot a job, e.g. ring the vet Friday · or paste a whole list from Notes"
        aria-label="New jobs" className="jot"
      />
      {jobs.length > 1 || (jobs.length === 1 && jobs[0].date) ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.7 }}>
          {jobs.slice(0, 12).map((j, i) => (
            <div key={i}>• {j.name} <span style={{ color: 'var(--green)' }}>{j.date ? `→ ${whenLabel(j.date, today)}` : when ? `→ ${whenLabel(when, today)}` : ''}</span></div>
          ))}
          {jobs.length > 12 && <div>…and {jobs.length - 12} more</div>}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        {chips.map(([label, d]) => (
          <button key={label} className={`chip${when === d ? ' active' : ''}`} onClick={() => setWhen(d)}>{label}</button>
        ))}
        <input type="date" value={when} onChange={e => setWhen(e.target.value)} style={{ width: 'auto', marginBottom: 0, fontSize: 13, padding: '4px 8px' }} aria-label="Due date" />
        <button className="btn-primary" onClick={add} disabled={!jobs.length} style={{ marginLeft: 'auto' }}>
          {jobs.length > 1 ? `Add ${jobs.length} jobs` : 'Add'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        Dates like “Friday”, “tomorrow”, “next week”, “14 March” or “in 2 weeks” are picked up from what you write.
      </div>
    </div>
  );
}

/* ─── My jobs: the undated list, like the back of an envelope ──────────── */

function MyJobs({ db, persist, addActivity, today }: { db: FarmData; persist: (d: FarmData) => void; addActivity: (m: string) => void; today: string }) {
  const [showAll, setShowAll] = useState(false);
  const [dating, setDating] = useState<string | null>(null);
  const jobs = (db.tasks || []).filter(t => !t.done && !t.date);
  if (!jobs.length) return null;

  const update = (id: string, patch: Partial<Task>) => persist({ ...db, tasks: db.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) });
  const shown = showAll ? jobs : jobs.slice(0, 10);

  return (
    <div className="card hub-form">
      <div className="card-title">My jobs ({jobs.length})</div>
      {shown.map(t => (
        <div key={t.id} className="job-row">
          <button className="job-tick" aria-label={`Done: ${t.name}`} onClick={() => { update(t.id, { done: true, doneDate: today }); addActivity(`Done: ${t.name}`); }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{t.name}</div>
            {t.notes && <div className="row-sub">{t.notes.split('\n')[0]}</div>}
          </div>
          {dating === t.id ? (
            <input type="date" autoFocus defaultValue="" onBlur={() => setDating(null)}
              onChange={e => { if (e.target.value) { update(t.id, { date: e.target.value }); setDating(null); } }}
              style={{ width: 'auto', marginBottom: 0, fontSize: 13, padding: '4px 6px' }} aria-label="Date for this job" />
          ) : (
            <button className="btn-cancel" onClick={() => setDating(t.id)} title="Give it a date: it moves into your day plan">Date</button>
          )}
          <button className="del-btn" aria-label={`Not needed: ${t.name}`} title="Not needed"
            onClick={() => update(t.id, { done: true, doneDate: today, notes: `${t.notes ? t.notes + '\n' : ''}Not needed (cleared on My day, ${today}).` })}>×</button>
        </div>
      ))}
      {!showAll && jobs.length > 10 && <button className="btn-cancel" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>Show all {jobs.length}</button>}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Tap the circle when it’s done. Give a job a date and it moves into your day plan.</div>
    </div>
  );
}
