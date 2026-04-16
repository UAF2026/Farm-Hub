'use client';

import { FarmData, DailyBriefing } from '@/lib/types';
import type { Task } from '@/lib/types';
import { fmtDate, fmtMoney } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; }

export default function Dashboard({ db, persist }: Props) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in1 = new Date(today); in1.setDate(today.getDate() + 1);
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);

  const inCrop = db.fields.filter(f => f.status === 'In crop').length;

  const billsDue = db.finance
    .filter(f => f.type.includes('Bill') && f.status === 'Outstanding' && f.due && new Date(f.due + 'T12:00:00') <= in30)
    .reduce((a, b) => a + (b.gross || b.amount || 0), 0);

  const invoicesOwed = db.finance
    .filter(f => f.type.includes('Invoice') && f.status === 'Outstanding')
    .reduce((a, b) => a + (b.gross || b.amount || 0), 0);

  const urgentTasks = (db.tasks || []).filter(t => !t.done && t.date && new Date(t.date + 'T12:00:00') <= in1);
  const upcomingSchemes = [...db.schemes].filter(s => s.date).sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 5);

  function completeTask(id: string) {
    const tasks = db.tasks.map(t => {
      if (t.id !== id) return t;
      if (t.repeat && t.repeat !== 'No repeat' && t.date) {
        const d = new Date(t.date + 'T12:00:00');
        if (t.repeat === 'Daily') d.setDate(d.getDate() + 1);
        else if (t.repeat === 'Weekly') d.setDate(d.getDate() + 7);
        else if (t.repeat === 'Monthly') d.setMonth(d.getMonth() + 1);
        else if (t.repeat === 'Annually') d.setFullYear(d.getFullYear() + 1);
        return { ...t, date: d.toISOString().slice(0, 10) };
      }
      return { ...t, done: true, doneDate: new Date().toISOString().slice(0, 10) };
    });
    persist({ ...db, tasks });
  }

  // Medicine withdrawal alerts
  const withdrawalAlerts = (db.medicine || []).filter(m => {
    if (!m.date || !m.withdrawalMeat) return false;
    const clearDate = new Date(m.date + 'T12:00:00');
    clearDate.setDate(clearDate.getDate() + m.withdrawalMeat);
    return clearDate >= today;
  });

  // Machinery service overdue
  const machineOverdue = (db.machinery || []).filter(m => {
    if (!m.nextServiceDate) return false;
    return new Date(m.nextServiceDate + 'T12:00:00') <= today;
  });

  // Utility renewals in 60 days
  const in60 = new Date(today); in60.setDate(today.getDate() + 60);
  const utilityDue = (db.utilities || []).filter(u => {
    if (!u.renewalDate) return false;
    return new Date(u.renewalDate + 'T12:00:00') <= in60;
  });

  /* ─── Briefing panel ─────────────────────────────────────────────────── */
  const briefing = db.dailyBriefing;
  const briefingIsToday = briefing?.date === new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* Daily Briefing */}
      {briefing ? (
        <div className="card" style={{ borderLeft: '4px solid var(--primary)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0', marginBottom: '0.5rem' }}>

          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div className="card-title" style={{ margin: 0 }}>📬 Farm Secretary Briefing</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(briefing.date)} · {briefing.emailsReviewed} emails</div>
              {!briefingIsToday && <div style={{ fontSize: 11, color: 'var(--amber, #d97706)' }}>⚠ Not today's briefing</div>}
            </div>
          </div>

          {/* Processed status chips */}
          {briefing.processed && (briefing.actionItems.length > 0 || briefing.invoices.length > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {briefing.actionItems.length > 0 && (
                <span className="badge" style={{ background: 'var(--red, #dc2626)', color: '#fff', fontSize: 11 }}>
                  ✓ {briefing.actionItems.length} task{briefing.actionItems.length !== 1 ? 's' : ''} added → Tasks
                </span>
              )}
              {briefing.invoices.length > 0 && (
                <span className="badge" style={{ background: 'var(--primary)', color: '#fff', fontSize: 11 }}>
                  ✓ {briefing.invoices.length} invoice{briefing.invoices.length !== 1 ? 's' : ''} added → Finance
                </span>
              )}
            </div>
          )}

          {/* Calendar events */}
          {briefing.calendarEvents.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)', marginBottom: 3 }}>📅 Calendar</div>
              {briefing.calendarEvents.map((ev, i) => (
                <div key={i} style={{ fontSize: 13, padding: '2px 0', color: 'var(--text)' }}>{ev}</div>
              ))}
            </div>
          )}

          {/* FYI information (not actions, not invoices) */}
          {briefing.information.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 3 }}>📋 For Your Information</div>
              {briefing.information.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: i < briefing.information.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', flex: 1, paddingRight: 8 }}>{item.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{item.from.replace(/<.*>/, '').trim()}</div>
                </div>
              ))}
            </div>
          )}

          {briefing.actionItems.length === 0 && briefing.invoices.length === 0 && briefing.information.length === 0 && (
            <div className="empty">Nothing farm-business related in today's inbox.</div>
          )}
        </div>
      ) : (
        <div className="card" style={{ borderLeft: '4px solid var(--text-muted)', opacity: 0.5, marginBottom: '0.5rem' }}>
          <div className="card-title" style={{ margin: 0 }}>📬 Farm Secretary Briefing</div>
          <div className="empty" style={{ marginTop: 6 }}>No briefing yet — runs automatically each morning.</div>
        </div>
      )}

      <div className="weather-strip">
        <span>Henley-on-Thames — check forecast before fieldwork</span>
        <a href="https://www.metoffice.gov.uk/weather/forecast/gcpvqhv8n" target="_blank" rel="noreferrer">Met Office →</a>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total cattle</div>
          <div className="metric-value">{db.cattle.length}</div>
          <div className="metric-sub">head on farm</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Fields in crop</div>
          <div className="metric-value">{inCrop}</div>
          <div className="metric-sub">of {db.fields.length} registered</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Bills due (30d)</div>
          <div className="metric-value">{fmtMoney(billsDue)}</div>
          <div className="metric-sub">outstanding</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Invoices owed</div>
          <div className="metric-value">{fmtMoney(invoicesOwed)}</div>
          <div className="metric-sub">to collect</div>
        </div>
      </div>

      <div className="card" style={{ borderLeft: '4px solid var(--red)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
        <div className="card-title" style={{ color: 'var(--red)' }}>Needs attention today</div>
        {urgentTasks.length === 0 && withdrawalAlerts.length === 0 && machineOverdue.length === 0 && utilityDue.length === 0
          ? <div className="empty">Nothing urgent today.</div>
          : <>
            {urgentTasks.map(t => (
              <div key={t.id} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name">{t.name}</div>
                  <div className="row-sub">{t.date ? fmtDate(t.date) : ''} · {t.category}</div>
                </div>
                <button className="done-btn" onClick={() => completeTask(t.id)}>Done</button>
              </div>
            ))}
            {withdrawalAlerts.map((m, i) => {
              const clear = new Date(m.date + 'T12:00:00');
              clear.setDate(clear.getDate() + m.withdrawalMeat);
              return (
                <div key={i} className="row-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-name">⚕ Withdrawal: {m.product} — {m.animal}</div>
                    <div className="row-sub">Meat clear {fmtDate(clear.toISOString().slice(0, 10))}</div>
                  </div>
                  <span className="badge bg-amber">Medicine</span>
                </div>
              );
            })}
            {machineOverdue.map((m, i) => (
              <div key={i} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name">🔧 Service overdue: {m.machine}</div>
                  <div className="row-sub">Due {fmtDate(m.nextServiceDate)}</div>
                </div>
                <span className="badge bg-red">Machinery</span>
              </div>
            ))}
            {utilityDue.map((u, i) => (
              <div key={i} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name">📋 Renewal due: {u.name}</div>
                  <div className="row-sub">{u.provider} · {fmtDate(u.renewalDate)}</div>
                </div>
                <span className="badge bg-amber">Utility</span>
              </div>
            ))}
          </>
        }
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Upcoming reminders</div>
          {upcomingSchemes.length === 0
            ? <div className="empty">No reminders yet.</div>
            : upcomingSchemes.map((s, i) => (
              <div key={i} className="row-item">
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' }}>
                  <div className={`dot ${s.priority === 'High priority' ? 'dot-red' : s.priority === 'Medium priority' ? 'dot-amber' : 'dot-green'}`} style={{ flexShrink: 0 }} />
                  <div>
                    <div className="row-name" style={{ fontSize: 13 }}>{s.name}</div>
                    <div className="row-sub">{fmtDate(s.date)}</div>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
        <div className="card">
          <div className="card-title">Recent activity</div>
          {db.activity.length === 0
            ? <div className="empty">No activity yet.</div>
            : db.activity.slice(0, 8).map((a, i) => (
              <div key={i} className="row-item">
                <div style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{a.msg}</div>
                <div className="row-sub" style={{ whiteSpace: 'nowrap' }}>{a.time}</div>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
}
