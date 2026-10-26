// The farm secretary: one ranked list of everything that needs doing, pulled
// from every part of the Hub (tasks, bills, invoices, certificates, contracts,
// machinery services, agreements, scheme deadlines). Shown on the "My day" tab.
//
// Nothing here changes the source records except the explicit actions
// (task done, bill paid). Snoozes and "not needed" are kept separately in
// data.secretary so the original dates stay true.

import type { FarmData, Finance, SecretaryState } from './types';

export type AgendaSource = 'task' | 'bill' | 'invoice' | 'certificate' | 'contract' | 'service' | 'agreement' | 'scheme';
export type AgendaAction = 'done' | 'paid' | 'snooze' | 'dismiss';

export interface AgendaItem {
  key: string;
  source: AgendaSource;
  title: string;
  detail?: string;
  due: string;              // YYYY-MM-DD: when it must be done (or the expiry/renewal date)
  showFrom: string;         // YYYY-MM-DD: when it starts appearing
  amount?: number;          // £, for bills and invoices
  important: boolean;
  guessedDate?: boolean;    // due date was missing and has been assumed
  section: string;          // where its record lives (hash for "Open")
  actions: AgendaAction[];
}

export const SOURCE_LABEL: Record<AgendaSource, string> = {
  task: 'Task', bill: 'Pay', invoice: 'Chase payment', certificate: 'Certificate', contract: 'Contract',
  service: 'Service', agreement: 'Agreement', scheme: 'Scheme',
};

export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

export function addDaysISO(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T12:00:00Z').getTime() - new Date(from + 'T12:00:00Z').getTime()) / 86400000);
}

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);
const d10 = (s: string) => s.slice(0, 10);

/** Stable key for a finance record (older ones have no id). */
export function financeKey(f: Finance): string {
  return f.id ? `fin:${f.id}` : `fin:${f.date}|${f.supplier}|${f.gross || f.amount}|${f.ref}`;
}

/** Everything that needs doing, before snoozes and dismissals are applied. */
export function collectAgenda(db: FarmData): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const t of db.tasks || []) {
    if (t.done || !isDate(t.date)) continue;
    items.push({
      key: `task:${t.id}`, source: 'task', title: t.name, detail: t.notes?.split('\n')[0]?.slice(0, 160),
      due: d10(t.date), showFrom: addDaysISO(d10(t.date), -7), important: t.priority === 'High',
      section: 'tasks', actions: ['done', 'snooze', 'dismiss'],
    });
  }

  for (const f of db.finance || []) {
    if (f.status !== 'Outstanding') continue;
    const isInvoice = f.type.includes('Invoice');
    const guessed = !isDate(f.due);
    const due = guessed ? (isDate(f.date) ? addDaysISO(d10(f.date), 30) : todayISO()) : d10(f.due);
    const amount = f.gross || f.amount || 0;
    items.push({
      key: financeKey(f), source: isInvoice ? 'invoice' : 'bill',
      title: isInvoice ? `${f.supplier || 'Customer'} owes you` : `Pay ${f.supplier || 'supplier'}`,
      detail: [f.desc, f.ref ? `ref ${f.ref}` : '', isDate(f.date) ? `dated ${fmt(d10(f.date))}` : ''].filter(Boolean).join(' · '),
      due, showFrom: addDaysISO(due, isInvoice ? 0 : -7), amount: amount || undefined, important: amount >= 1000,
      guessedDate: guessed, section: 'finance', actions: ['paid', 'snooze', 'dismiss'],
    });
  }

  for (const c of db.certificates || []) {
    if (!isDate(c.expiryDate)) continue;
    items.push({
      key: `cert:${c.id}:${c.expiryDate}`, source: 'certificate', title: `Renew: ${c.name}`,
      detail: [c.holder, c.notes?.slice(0, 140)].filter(Boolean).join(' · '),
      due: d10(c.expiryDate), showFrom: addDaysISO(d10(c.expiryDate), -60), important: /insurance|red tractor|tb|assur/i.test(c.name + c.category),
      section: 'compliance', actions: ['dismiss', 'snooze'],
    });
  }

  for (const u of db.utilities || []) {
    if (!isDate(u.renewalDate)) continue;
    const notice = u.noticePeriodDays || 0;
    items.push({
      key: `util:${u.id}:${u.renewalDate}`, source: 'contract',
      title: `${u.name}${u.provider ? ` (${u.provider})` : ''} renews`,
      detail: [notice ? `${notice} days' notice to cancel` : '', u.annualCost ? `£${Math.round(u.annualCost).toLocaleString('en-GB')}/yr` : '', 'compare prices before it rolls over'].filter(Boolean).join(' · '),
      due: d10(u.renewalDate), showFrom: addDaysISO(d10(u.renewalDate), -Math.max(60, notice + 30)), important: notice > 0,
      section: 'utilities', actions: ['dismiss', 'snooze'],
    });
  }

  for (const m of db.machinery || []) {
    if (!isDate(m.nextServiceDate)) continue;
    items.push({
      key: `mach:${m.id}:${m.nextServiceDate}`, source: 'service', title: `${m.machine}: ${m.serviceType || 'service'} due`,
      detail: [m.supplier, m.description].filter(Boolean).join(' · '),
      due: d10(m.nextServiceDate), showFrom: addDaysISO(d10(m.nextServiceDate), -21), important: /mot/i.test(m.serviceType),
      section: 'machinery', actions: ['dismiss', 'snooze'],
    });
  }

  for (const a of db.farmBible?.agreements || []) {
    if (!isDate(a.endDate)) continue;
    items.push({
      key: `agr:${a.id}:${a.endDate}`, source: 'agreement', title: `${a.name} ends`,
      detail: [a.counterparty, a.annualValue ? `£${Math.round(a.annualValue).toLocaleString('en-GB')}/yr` : ''].filter(Boolean).join(' · '),
      due: d10(a.endDate!), showFrom: addDaysISO(d10(a.endDate!), a.type === 'Scheme' ? -180 : -90), important: true,
      section: 'farmbible', actions: ['dismiss', 'snooze'],
    });
  }

  for (const s of db.schemes || []) {
    if (!isDate(s.date)) continue;
    items.push({
      key: `scheme:${s.name}:${s.date}`, source: 'scheme', title: s.name, detail: s.notes?.slice(0, 160),
      due: d10(s.date), showFrom: addDaysISO(d10(s.date), -30), important: /high/i.test(s.priority),
      section: 'schemes', actions: ['dismiss', 'snooze'],
    });
  }

  return items;
}

export interface Agenda {
  overdue: AgendaItem[];
  today: AgendaItem[];
  week: AgendaItem[];
  later: AgendaItem[];     // within each item's look-ahead window
  snoozedCount: number;
}

const rank = (a: AgendaItem, b: AgendaItem) =>
  Number(b.important) - Number(a.important) || a.due.localeCompare(b.due) || a.title.localeCompare(b.title);

/** The agenda as of `today`, with snoozed and dismissed items taken out. */
export function buildAgenda(db: FarmData, today = todayISO()): Agenda {
  const st: SecretaryState = db.secretary || { snoozed: {}, dismissed: {} };
  const weekEnd = addDaysISO(today, 7);
  const out: Agenda = { overdue: [], today: [], week: [], later: [], snoozedCount: 0 };
  for (const it of collectAgenda(db)) {
    if (st.dismissed?.[it.key]) continue;
    const until = st.snoozed?.[it.key];
    if (until && until > today) { out.snoozedCount++; continue; }
    if (it.showFrom > today && !(until && until <= today)) continue;
    if (it.due < today) out.overdue.push(it);
    else if (it.due === today) out.today.push(it);
    else if (it.due <= weekEnd) out.week.push(it);
    else out.later.push(it);
  }
  out.overdue.sort(rank); out.today.sort(rank); out.week.sort((a, b) => a.due.localeCompare(b.due) || rank(a, b)); out.later.sort((a, b) => a.due.localeCompare(b.due));
  return out;
}

/** Apply one of the item's actions, returning the updated data. */
export function applyAction(db: FarmData, item: AgendaItem, action: AgendaAction, snoozeDays = 7, today = todayISO()): FarmData {
  const st: SecretaryState = { snoozed: { ...(db.secretary?.snoozed || {}) }, dismissed: { ...(db.secretary?.dismissed || {}) } };

  if (action === 'snooze') {
    st.snoozed[item.key] = addDaysISO(today, snoozeDays);
    return { ...db, secretary: st };
  }

  if (item.source === 'task' && (action === 'done' || action === 'dismiss')) {
    const id = item.key.slice('task:'.length);
    return {
      ...db,
      tasks: db.tasks.map(t => t.id === id
        ? { ...t, done: true, doneDate: today, notes: action === 'dismiss' ? `${t.notes ? t.notes + '\n' : ''}Not needed (cleared on My day, ${today}).` : t.notes }
        : t),
    };
  }

  if ((item.source === 'bill' || item.source === 'invoice') && action === 'paid') {
    return { ...db, finance: db.finance.map(f => (financeKey(f) === item.key ? { ...f, status: 'Paid', paidDate: today } : f)) };
  }

  // Handled / not needed for everything else: remember it, leave the record as is.
  st.dismissed[item.key] = today;
  delete st.snoozed[item.key];
  return { ...db, secretary: st };
}

export function fmt(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function whenLabel(due: string, today = todayISO()): string {
  const n = daysBetween(today, due);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return n > -60 ? `${-n} days overdue` : `overdue since ${fmt(due)}`;
  if (n < 7) return new Date(due + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
  return `${fmt(due)} (${n} days)`;
}
