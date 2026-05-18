'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { Scheme } from '@/lib/types';
import { fmtDate, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

// ── Known scheme income data ─────────────────────────────────────────────
const SCHEME_INCOME = [
  { id: 'sfi1', name: 'SFI 1', ref: 'UAF332270030', annual: 56074, ends: '2027-03-31', status: 'active' as const },
  { id: 'sfi2', name: 'SFI 2', ref: 'M J Hunt & Son 24', annual: 38418, ends: '2027-11-30', status: 'active' as const },
  { id: 'sfi3', name: 'SFI 3', ref: 'M J Hunt & Son 25E', annual: 9300, ends: '2028-09-30', status: 'active' as const },
  { id: 'cs',   name: 'CS Agreement', ref: '1255553', annual: 44734, ends: '2026-12-31', status: 'active' as const },
];
const TOTAL_KNOWN = SCHEME_INCOME.reduce((a, s) => a + s.annual, 0);

const SCHEME_DATA: Scheme[] = [
  { name: 'CS annual claim deadline - submit by 15 May', date: '2026-05-15', priority: 'High priority', notes: 'CS agreement 1255553. Late after 15 May loses 1% per working day. After 1 Sep loses all payment for year.' },
  { name: 'CS rotational options locations - notify RPA by 1 Sep', date: '2026-09-01', priority: 'High priority', notes: 'CS 1255553. Confirm AB1, AB2, AB5, AB9, AB10, AB14, AB15, GS3 locations on claim form by 1 September.' },
  { name: 'CS AB2 overwinter stubble - confirm location by 1 Sep', date: '2026-09-01', priority: 'High priority', notes: 'CS 1255553. Record stubble locations on SU7288 6817, SU7288 4543, SU7287 5465, SU7287 5893 for winter 2026/27.' },
  { name: 'CS agreement ends - begin replacement planning', date: '2026-10-01', priority: 'High priority', notes: 'CS agreement 1255553 ends 31 Dec 2026. Contact adviser to explore renewal or replacement options.' },
  { name: 'SFI 1 agreement ends - begin replacement planning', date: '2026-10-01', priority: 'High priority', notes: 'SFI 1690256 ends 31 Mar 2027. Worth £56,074/year. Monitor RPA for SFI reopening. Speak to adviser.' },
  { name: 'SFI 1 SAM1 soil sampling - arrange ahead of April', date: '2026-04-01', priority: 'High priority', notes: 'SFI 1690256. Annual soil organic matter testing required across all SAM1 parcels. Book sampler in advance.' },
  { name: 'SFI 3 SOH3 cover crops - establish by autumn', date: '2026-09-01', priority: 'High priority', notes: 'SFI 2196980. Multi-species cover crops on 57ha: SU7387 6074/7025/7575, SU7486 2085, SU7487 1809/2040.' },
  { name: 'SFI 1 HRW1 hedgerow condition assessment', date: '2026-04-01', priority: 'Medium priority', notes: 'SFI 1690256. Annual assessment of 29,565m of hedgerow. Record and retain evidence.' },
  { name: 'SFI 1 IPM1 - review integrated pest management plan', date: '2026-04-01', priority: 'Medium priority', notes: 'SFI 1690256. Annual IPM plan review. Keep updated plan on farm for inspection.' },
  { name: 'SFI 1 NUM1 - nutrient management review report', date: '2026-04-01', priority: 'Medium priority', notes: 'SFI 1690256. Annual nutrient management review required. Worth £652/year.' },
  { name: 'SFI 1 NUM3 legume fallow - management check', date: '2026-04-01', priority: 'Medium priority', notes: 'SFI 1690256. Legume fallow on 20.59ha parcel SU7285 4854. Check management requirements annually.' },
  { name: 'SFI 2 AHW2 - purchase supplementary bird food 1 tonne', date: '2026-11-01', priority: 'Medium priority', notes: 'SFI 1927187. 1 tonne supplementary winter bird food required annually. Keep purchase receipt as evidence.' },
  { name: 'SFI 2 AHW5 - maintain lapwing nesting plots 2ha', date: '2026-04-01', priority: 'Medium priority', notes: 'SFI 1927187. 2ha lapwing nesting plots on SU7387 3575. Maintain per action requirements.' },
  { name: 'SFI 2 PRF1 - keep variable rate nutrient records', date: '2026-04-01', priority: 'Medium priority', notes: 'SFI 1927187. Variable rate application records must be kept for all PRF1 parcels. John Deere records count.' },
  { name: 'CS BE3 hedgerow management - annual check', date: '2026-06-01', priority: 'Medium priority', notes: 'CS 1255553. Hedgerow management on 2,184m on parcel SU7196 5083. Check management is compliant.' },
  { name: 'CS GS6 species-rich grassland - management check', date: '2026-05-01', priority: 'Medium priority', notes: 'CS 1255553. Species-rich grassland on SU7287 7507 (10.29ha) and SU7391 1075 (8.37ha). Check cutting/grazing.' },
  { name: 'RPA annual claim window - check ruralpayments.org', date: '2026-02-01', priority: 'Medium priority', notes: 'Check Rural Payments for SAF and CS claim windows. Log in at ruralpayments.org' },
  { name: 'SFI 3 agreement ends 30 Sep 2028', date: '2028-07-01', priority: 'Low priority', notes: 'SFI 2196980 ends 30 Sep 2028. SOH3 cover crops 57ha. Begin planning 3 months ahead of expiry.' }
];

type SchemeView = 'risk' | 'reminders';

export default function Schemes({ db, persist, addActivity }: Props) {
  const [schemeView, setSchemeView] = useState<SchemeView>('risk');
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<'High priority' | 'Medium priority' | 'Low priority'>('Medium priority');
  const [notes, setNotes] = useState('');

  const schemes = db.schemes || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sorted = [...schemes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // upcoming reminders (not past)
  const upcoming = sorted.filter(s => !s.date || new Date(s.date + 'T12:00:00') >= today);
  const past = sorted.filter(s => s.date && new Date(s.date + 'T12:00:00') < today);

  function addScheme() {
    if (!name.trim() || !date) return alert('Name and date required');
    const scheme: Scheme = { name: name.trim(), date, priority, notes };
    addActivity(`Added scheme: ${name}`);
    persist({ ...db, schemes: [...schemes, scheme] });
    setModal(false);
    setName(''); setDate(''); setPriority('Medium priority'); setNotes('');
  }

  function deleteScheme(idx: number) {
    if (!confirm('Delete this reminder?')) return;
    persist({ ...db, schemes: schemes.filter((_, i) => i !== idx) });
  }

  function loadSchemes() {
    const existing = schemes.map(s => s.name);
    const toAdd = SCHEME_DATA.filter(s => !existing.includes(s.name));
    addActivity(`Loaded ${toAdd.length} scheme reminders`);
    persist({ ...db, schemes: [...schemes, ...toAdd] });
  }

  function getPriorityColor(p: string): string {
    if (p === 'High priority') return 'dot-red';
    if (p === 'Medium priority') return 'dot-amber';
    return 'dot-green';
  }

  function daysUntil(dateStr: string): number {
    const d = new Date(dateStr + 'T12:00:00');
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }

  function monthsUntil(dateStr: string): number {
    const d = new Date(dateStr + 'T12:00:00');
    return Math.round((d.getTime() - today.getTime()) / (86400000 * 30.5));
  }

  // ── Timeline calculations ─────────────────────────────────────────────
  // We want to show a visual timeline from now → end of 2028
  const timelineStart = today.getTime();
  const timelineEnd = new Date('2029-01-01').getTime();
  const timelineSpan = timelineEnd - timelineStart;

  function timelinePct(dateStr: string): number {
    const t = new Date(dateStr + 'T12:00:00').getTime();
    return Math.max(0, Math.min(100, ((t - timelineStart) / timelineSpan) * 100));
  }

  // Year markers
  const yearMarkers = [2026, 2027, 2028, 2029].map(y => ({
    year: y,
    pct: timelinePct(`${y}-01-01`)
  }));

  // How much income expires each year
  const expiryByYear: Record<string, number> = {};
  SCHEME_INCOME.forEach(s => {
    const yr = s.ends.slice(0, 4);
    expiryByYear[yr] = (expiryByYear[yr] || 0) + s.annual;
  });

  // Replaceable action items
  const replacementActions = [
    { scheme: 'CS Agreement', deadline: 'Now', action: 'Contact ADAS/adviser — CS ends Dec 2026. Explore higher-tier CS renewal or SFI top-up options.', urgent: true },
    { scheme: 'SFI 1 (£56,074/yr)', deadline: 'Oct 2026', action: 'Monitor RPA for SFI reopening. Submit new SFI application as soon as window opens. Speak to adviser about eligible actions on your land.', urgent: true },
    { scheme: 'SFI 2 (£38,418/yr)', deadline: 'Aug 2027', action: 'SFI 2 ends Nov 2027. Begin renewal discussions with adviser by Aug 2027 at latest.', urgent: false },
    { scheme: 'SFI 3 (£9,300/yr)', deadline: 'Jun 2028', action: 'SFI 3 ends Sep 2028. Continue SOH3 cover crops and plan renewal/replacement.', urgent: false },
  ];

  function fmtMoney(n: number): string {
    if (!n) return '—';
    return '£' + n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="btn-add" onClick={() => setModal(true)}>+ Add reminder</button>
        <button className="btn-primary" onClick={loadSchemes}>Load CS & SFI reminders</button>
      </div>

      {/* ── View tabs ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setSchemeView('risk')} style={{ padding: '0.4rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: schemeView === 'risk' ? 700 : 400, color: schemeView === 'risk' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: schemeView === 'risk' ? '2px solid var(--primary)' : '2px solid transparent', fontSize: 13 }}>
          Income risk
        </button>
        <button onClick={() => setSchemeView('reminders')} style={{ padding: '0.4rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: schemeView === 'reminders' ? 700 : 400, color: schemeView === 'reminders' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: schemeView === 'reminders' ? '2px solid var(--primary)' : '2px solid transparent', fontSize: 13 }}>
          Deadlines & reminders {upcoming.length > 0 && <span style={{ background: 'var(--red, #dc2626)', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>{upcoming.filter(s => s.priority === 'High priority').length}</span>}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* INCOME RISK VIEW                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {schemeView === 'risk' && (
        <>
          {/* KPI strip */}
          <div className="metric-grid" style={{ marginBottom: '1rem' }}>
            <div className="metric-card">
              <div className="metric-label">Total scheme income</div>
              <div className="metric-value">{fmtMoney(TOTAL_KNOWN)}</div>
              <div className="metric-sub">per year (known SFI)</div>
            </div>
            <div className="metric-card" style={{ borderColor: 'var(--red, #dc2626)', borderWidth: 2, borderStyle: 'solid' }}>
              <div className="metric-label" style={{ color: 'var(--red, #dc2626)' }}>At risk by Mar 2027</div>
              <div className="metric-value" style={{ color: 'var(--red, #dc2626)' }}>{fmtMoney(56074)}</div>
              <div className="metric-sub">SFI 1 + CS ending</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">At risk by Dec 2027</div>
              <div className="metric-value">{fmtMoney(56074 + 38418)}</div>
              <div className="metric-sub">SFI 1 + SFI 2 + CS</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Months to CS end</div>
              <div className="metric-value" style={{ color: monthsUntil('2026-12-31') < 9 ? 'var(--amber, #d97706)' : undefined }}>{monthsUntil('2026-12-31')}</div>
              <div className="metric-sub">Dec 2026</div>
            </div>
          </div>

          {/* Visual timeline */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">Agreement timeline</div>
            <div style={{ position: 'relative', marginTop: '1.5rem', marginBottom: '2rem' }}>
              {/* Year markers */}
              {yearMarkers.map(({ year, pct }) => (
                <div key={year} style={{ position: 'absolute', left: `${pct}%`, top: -20, transform: 'translateX(-50%)', fontSize: 11, color: 'var(--text-muted)', userSelect: 'none' }}>{year}</div>
              ))}
              {yearMarkers.map(({ year, pct }) => (
                <div key={year + 'line'} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: 1, background: 'var(--border)', zIndex: 0 }} />
              ))}

              {/* Scheme bars */}
              {SCHEME_INCOME.map((s, i) => {
                const startPct = 0;
                const endPct = timelinePct(s.ends);
                const width = endPct - startPct;
                const isExpiringSoon = monthsUntil(s.ends) < 12;
                const barColor = isExpiringSoon ? 'var(--red, #dc2626)' : 'var(--primary)';
                return (
                  <div key={s.id} style={{ position: 'relative', height: 32, marginBottom: 8 }}>
                    {/* Label */}
                    <div style={{ position: 'absolute', left: 0, top: 0, fontSize: 12, fontWeight: 600, color: 'var(--text)', zIndex: 2, lineHeight: '32px', paddingRight: 8, background: 'var(--bg, #fff)', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </div>
                    {/* Track */}
                    <div style={{ position: 'absolute', left: '18%', right: 0, top: '50%', transform: 'translateY(-50%)', height: 12, background: 'var(--bg-secondary, #f3f4f6)', borderRadius: 6, overflow: 'visible' }}>
                      {/* Fill */}
                      <div style={{ position: 'absolute', left: 0, width: `${Math.max(0, (endPct / (100 - 18)) * 100)}%`, height: '100%', background: barColor, borderRadius: 6, opacity: isExpiringSoon ? 0.85 : 0.7 }} />
                      {/* End marker */}
                      <div style={{ position: 'absolute', left: `${Math.max(0, (endPct / (100 - 18)) * 100)}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, borderRadius: '50%', background: barColor, border: '2px solid #fff', zIndex: 3 }} />
                      {/* End label */}
                      <div style={{ position: 'absolute', left: `${Math.max(0, (endPct / (100 - 18)) * 100)}%`, top: -18, transform: 'translateX(-50%)', fontSize: 10, color: barColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {s.ends.slice(0, 7)} {s.annual > 0 && `· ${fmtMoney(s.annual)}/yr`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Red = agreement ending within 12 months. Blue = more than 12 months remaining.</div>
          </div>

          {/* What needs to happen */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">🔴 Actions to protect income</div>
            {replacementActions.map((a, i) => (
              <div key={i} className="row-item" style={{ borderLeft: `3px solid ${a.urgent ? 'var(--red, #dc2626)' : 'var(--primary)'}`, paddingLeft: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="row-name" style={{ fontSize: 13 }}>{a.scheme}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: a.urgent ? 'var(--red, #dc2626)' : 'var(--amber, #d97706)', marginLeft: 8, flexShrink: 0 }}>Act by {a.deadline}</span>
                  </div>
                  <div className="row-sub" style={{ fontSize: 12, marginTop: 3 }}>{a.action}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Scheme details */}
          <div className="card">
            <div className="card-title">Current agreements</div>
            {SCHEME_INCOME.map(s => (
              <div key={s.id} className="row-item">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="row-name">{s.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.annual > 0 ? fmtMoney(s.annual) + '/yr' : s.annualNote || '—'}</div>
                  </div>
                  <div className="row-sub">Ref: {s.ref} · Ends {fmtDate(s.ends)} · {monthsUntil(s.ends)} months remaining</div>
                </div>
              </div>
            ))}
          </div>

          {/* Scheme links */}
          <div className="link-grid" style={{ marginTop: '1rem' }}>
            <div className="link-card">
              <div className="link-group-title">Key links</div>
              <a href="https://www.ruralpayments.org" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ flex: 1 }}><div className="link-name">Rural Payments</div><div className="link-desc">Submit claims online</div></div>
              </a>
              <a href="https://www.gov.uk/government/collections/sustainable-farming-incentive-guidance" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ flex: 1 }}><div className="link-name">SFI guidance</div><div className="link-desc">Rules and payments</div></div>
              </a>
              <a href="https://www.gov.uk/government/collections/countryside-stewardship-get-paid-to-look-after-the-countryside" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ flex: 1 }}><div className="link-name">CS guidance</div><div className="link-desc">Agreement management</div></div>
              </a>
              <a href="https://www.gov.uk/guidance/farming-investment-fund" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ flex: 1 }}><div className="link-name">Farming Investment Fund</div><div className="link-desc">Equipment grants</div></div>
              </a>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* REMINDERS VIEW                                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {schemeView === 'reminders' && (
        <>
          {upcoming.length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-title">Upcoming ({upcoming.length})</div>
              {upcoming.map((s, i) => {
                const origIdx = schemes.indexOf(s);
                const days = daysUntil(s.date);
                const daysLabel = days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : days <= 7 ? `In ${days}d` : days <= 30 ? `In ${days}d` : fmtDate(s.date);
                const daysColor = days < 0 ? 'var(--red, #dc2626)' : days <= 7 ? 'var(--red, #dc2626)' : days <= 30 ? 'var(--amber, #d97706)' : 'var(--text-muted)';
                return (
                  <div key={i} className="row-item">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' }}>
                      <div className={`dot ${getPriorityColor(s.priority)}`} style={{ flexShrink: 0, marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-name" style={{ fontSize: 13 }}>{s.name}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: daysColor, fontWeight: 600 }}>{daysLabel}</span>
                          <span className="row-sub" style={{ fontSize: 11 }}>{fmtDate(s.date)}</span>
                        </div>
                        {s.notes && <div className="row-sub" style={{ fontSize: 12, marginTop: 4 }}>{s.notes}</div>}
                      </div>
                      <button className="del-btn" onClick={() => deleteScheme(origIdx)} style={{ flexShrink: 0 }}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {past.length > 0 && (
            <div className="card">
              <div className="card-title" style={{ color: 'var(--text-muted)' }}>Past ({past.length})</div>
              {past.map((s, i) => {
                const origIdx = schemes.indexOf(s);
                return (
                  <div key={i} className="row-item" style={{ opacity: 0.6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' }}>
                      <div className={`dot ${getPriorityColor(s.priority)}`} style={{ flexShrink: 0, marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-name" style={{ fontSize: 13 }}>{s.name}</div>
                        <div className="row-sub">{fmtDate(s.date)}</div>
                        {s.notes && <div className="row-sub" style={{ fontSize: 12, marginTop: 4 }}>{s.notes}</div>}
                      </div>
                      <button className="del-btn" onClick={() => deleteScheme(origIdx)} style={{ flexShrink: 0 }}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {schemes.length === 0 && (
            <div className="card"><div className="empty">No reminders set. Click "Load CS & SFI reminders" to pre-populate.</div></div>
          )}
        </>
      )}

      {/* ── Add modal ────────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Add scheme reminder</div>
            <div className="field-row">
              <label className="form-label">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Scheme action or deadline" />
            </div>
            <div className="field-row">
              <label className="form-label">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as 'High priority' | 'Medium priority' | 'Low priority')}>
                <option>High priority</option>
                <option>Medium priority</option>
                <option>Low priority</option>
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details and context" style={{ minHeight: 80 }} />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={addScheme}>Add</button>
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
