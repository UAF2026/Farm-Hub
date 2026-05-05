'use client';

import { useMemo, useState } from 'react';
import { FarmData } from '@/lib/types';
import type { Utility } from '@/lib/types';
import { fmtDate, fmtMoney, uid, daysUntil } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const CATEGORIES = [
  'Electricity',
  'Water',
  'Phone & Mobile',
  'Broadband',
  'Insurance',
  'Machinery finance',
  'Membership',
  'Professional fees',
  'Vehicle',
  'Storage / silo',
  'Software',
  'Other',
];

const SERVICE_PRESETS_BY_CATEGORY: Record<string, string[]> = {
  Electricity: ['Farm electricity - Stonor Valley', 'Farmhouse electricity', 'Grain dryer electricity'],
  Water: ['Farm water - Castle Water', 'Farmhouse water - Thames Water'],
  'Phone & Mobile': ['Mobile phones', 'Farm landline', 'RuralView Multi-SIM'],
  Broadband: ['Farm broadband', 'Farmhouse broadband'],
  Insurance: ['Farm insurance - NFU Mutual', 'Vehicle insurance', 'Public liability'],
  'Machinery finance': ['Tractor HP', 'Combine lease', 'Sprayer finance'],
  Membership: ['NFU membership', 'Red Tractor', 'SAI Global', 'BASIS', 'FACTS'],
  'Professional fees': ['Accountant - N R Cox', 'Agronomist - Frontier', 'Solicitor', 'Land agent - Savills'],
  Vehicle: ['Vehicle lease', 'Pickup finance'],
  'Storage / silo': ['Grain storage - Heygates', 'Cold store'],
  Software: ['Farm Hub hosting', 'Other software'],
  Other: [],
};

export default function Utilities({ db, persist, addActivity }: Props) {
  const utilities = db.utilities || [];

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [customName, setCustomName] = useState('');
  const [provider, setProvider] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [startDate, setStartDate] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [annualCost, setAnnualCost] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [noticePeriodDays, setNoticePeriodDays] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Active');
  const [filterCategory, setFilterCategory] = useState<string>('');

  const active = utilities.filter(u => u.status === 'Active');
  const totalAnnual = active.reduce((a, b) => a + (b.annualCost || 0), 0);
  const totalMonthly = totalAnnual / 12;

  const upcomingRenewals = useMemo(() => {
    return active
      .filter(u => u.renewalDate)
      .map(u => ({ u, days: daysUntil(u.renewalDate) }))
      .filter(x => x.days >= 0 && x.days <= 90)
      .sort((a, b) => a.days - b.days);
  }, [active]);

  function resetForm() {
    setEditId(null);
    setCategory('');
    setName('');
    setCustomName('');
    setProvider('');
    setAccountRef('');
    setStartDate('');
    setRenewalDate('');
    setAnnualCost('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setNoticePeriodDays('');
    setPaymentMethod('');
    setNotes('');
    setStatus('Active');
  }

  function loadForEdit(u: Utility) {
    setEditId(u.id);
    setCategory(u.category || '');
    setName(u.name);
    setProvider(u.provider);
    setAccountRef(u.accountRef);
    setStartDate(u.startDate);
    setRenewalDate(u.renewalDate);
    setAnnualCost(String(u.annualCost ?? ''));
    setContactName(u.contactName || '');
    setContactPhone(u.contactPhone || '');
    setContactEmail(u.contactEmail || '');
    setNoticePeriodDays(u.noticePeriodDays ? String(u.noticePeriodDays) : '');
    setPaymentMethod(u.paymentMethod || '');
    setNotes(u.notes);
    setStatus(u.status);
    setModal(true);
  }

  function save() {
    const nameToUse = (name === 'Other' || (!SERVICE_PRESETS_BY_CATEGORY[category]?.includes(name) && customName)) ? customName.trim() || name : name;
    if (!nameToUse || !provider.trim() || !renewalDate || !annualCost) {
      return alert('Service, provider, renewal date, and annual cost are required.');
    }
    const annual = parseFloat(annualCost) || 0;
    const record: Utility = {
      id: editId || uid(),
      name: nameToUse,
      provider: provider.trim(),
      accountRef: accountRef.trim(),
      startDate,
      renewalDate,
      annualCost: annual,
      notes,
      status,
      category: category || undefined,
      monthlyCost: annual / 12,
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      noticePeriodDays: noticePeriodDays ? parseInt(noticePeriodDays, 10) : undefined,
      paymentMethod: paymentMethod || undefined,
    };
    if (editId) {
      addActivity(`Updated contract: ${nameToUse}`);
      persist({ ...db, utilities: utilities.map(u => u.id === editId ? record : u) });
    } else {
      addActivity(`Added contract: ${nameToUse}`);
      persist({ ...db, utilities: [...utilities, record] });
    }
    resetForm();
    setModal(false);
  }

  function deleteUtility(id: string) {
    if (!confirm('Delete this contract?')) return;
    persist({ ...db, utilities: utilities.filter(u => u.id !== id) });
  }

  // Group by category for display.
  const filtered = filterCategory
    ? utilities.filter(u => (u.category || 'Other') === filterCategory)
    : utilities;
  const grouped = useMemo(() => {
    const out: Record<string, Utility[]> = {};
    for (const u of filtered) {
      const cat = u.category || 'Other';
      if (!out[cat]) out[cat] = [];
      out[cat].push(u);
    }
    for (const cat of Object.keys(out)) {
      out[cat].sort((a, b) => (a.renewalDate || '').localeCompare(b.renewalDate || ''));
    }
    return out;
  }, [filtered]);

  const presetServices = category ? SERVICE_PRESETS_BY_CATEGORY[category] || [] : [];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-add" onClick={() => { resetForm(); setModal(true); }}>+ Add contract</button>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Active contracts</div>
          <div className="metric-value">{active.length}</div>
          <div className="metric-sub">{utilities.length} total</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Monthly burn</div>
          <div className="metric-value">{fmtMoney(totalMonthly)}</div>
          <div className="metric-sub">{fmtMoney(totalAnnual)}/year</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Renewals next 90 days</div>
          <div className="metric-value" style={{ color: upcomingRenewals.length > 0 ? 'var(--amber)' : 'inherit' }}>
            {upcomingRenewals.length}
          </div>
          <div className="metric-sub">{upcomingRenewals.filter(x => x.days <= 30).length} within 30d</div>
        </div>
      </div>

      {upcomingRenewals.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
          <div className="card-title">Renewals coming up</div>
          {upcomingRenewals.map(({ u, days }) => {
            const colour = days < 30 ? 'var(--red)' : days < 60 ? 'var(--amber)' : 'inherit';
            return (
              <div key={u.id} className="row-item" onClick={() => loadForEdit(u)} style={{ cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div className="row-name">{u.name}</div>
                  <div className="row-sub">
                    {u.provider}
                    {u.accountRef && ` · ${u.accountRef}`}
                    {' · '}{fmtMoney(u.annualCost)}/yr
                    {u.noticePeriodDays && ` · ${u.noticePeriodDays}d notice`}
                  </div>
                </div>
                <div style={{ color: colour, fontWeight: 600, marginRight: 8 }}>
                  {days} day{days === 1 ? '' : 's'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {Object.keys(grouped).length === 0
        ? <div className="card"><div className="empty">No contracts yet. Click "+ Add contract" to start.</div></div>
        : Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, items]) => {
              const catTotal = items.filter(u => u.status === 'Active').reduce((a, b) => a + (b.annualCost || 0), 0);
              return (
                <div key={cat} className="card">
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{cat}</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary, #666)' }}>
                      {fmtMoney(catTotal)}/yr · {items.length} {items.length === 1 ? 'contract' : 'contracts'}
                    </span>
                  </div>
                  {items.map(u => {
                    const days = u.renewalDate ? daysUntil(u.renewalDate) : null;
                    let badgeColor = 'bg-green';
                    if (u.status !== 'Active') badgeColor = 'bg-gray';
                    else if (days != null && days < 30) badgeColor = 'bg-red';
                    else if (days != null && days < 90) badgeColor = 'bg-amber';
                    return (
                      <div key={u.id} className="row-item" onClick={() => loadForEdit(u)} style={{ cursor: 'pointer' }}>
                        <div style={{ flex: 1 }}>
                          <div className="row-name">{u.name}</div>
                          <div className="row-sub">
                            {u.provider}
                            {u.accountRef && ` · ${u.accountRef}`}
                            {' · '}{fmtMoney(u.annualCost)}/yr ({fmtMoney((u.monthlyCost ?? u.annualCost / 12))}/mo)
                            {u.renewalDate && ` · Renews ${fmtDate(u.renewalDate)}`}
                            {days != null && days >= 0 && ` (${days}d)`}
                            {u.paymentMethod && ` · ${u.paymentMethod}`}
                          </div>
                          {(u.contactName || u.contactPhone || u.contactEmail) && (
                            <div className="row-sub" style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                              {u.contactName}
                              {u.contactPhone && (
                                <>
                                  {u.contactName ? ' · ' : ''}
                                  <a href={`tel:${u.contactPhone}`} onClick={e => e.stopPropagation()}>{u.contactPhone}</a>
                                </>
                              )}
                              {u.contactEmail && (
                                <>
                                  {' · '}
                                  <a href={`mailto:${u.contactEmail}`} onClick={e => e.stopPropagation()}>{u.contactEmail}</a>
                                </>
                              )}
                            </div>
                          )}
                          {u.notes && <div className="row-sub" style={{ fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>{u.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          <span className={`badge ${badgeColor}`} style={{ fontSize: 10 }}>{u.status}</span>
                          <button className="del-btn" onClick={(e) => { e.stopPropagation(); deleteUtility(u.id); }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
      }

      {modal && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">{editId ? 'Edit contract' : 'Add contract'}</div>

            <div className="field-row">
              <label className="form-label">Category</label>
              <select value={category} onChange={(e) => { setCategory(e.target.value); setName(''); }}>
                <option value="">Select category</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div className="field-row">
              <label className="form-label">Service</label>
              <select value={name} onChange={(e) => setName(e.target.value)}>
                <option value="">Select service</option>
                {presetServices.map(p => <option key={p}>{p}</option>)}
                <option value="Other">Other (specify below)</option>
              </select>
              {(name === 'Other' || (name && !presetServices.includes(name))) && (
                <input
                  type="text"
                  value={customName || (name !== 'Other' ? name : '')}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Service name"
                  style={{ marginTop: '0.5rem' }}
                />
              )}
            </div>

            <div className="field-row">
              <label className="form-label">Provider</label>
              <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Company name" />
            </div>

            <div className="field-row">
              <label className="form-label">Account / policy ref</label>
              <input type="text" value={accountRef} onChange={(e) => setAccountRef(e.target.value)} placeholder="Account or policy number" />
            </div>

            <div className="field-row" style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Renewal date</label>
                <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
              </div>
            </div>

            <div className="field-row" style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Annual cost (£)</label>
                <input type="number" value={annualCost} onChange={(e) => setAnnualCost(e.target.value)} placeholder="0.00" step="0.01" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Notice period (days)</label>
                <input type="number" value={noticePeriodDays} onChange={(e) => setNoticePeriodDays(e.target.value)} placeholder="e.g. 30" />
              </div>
            </div>

            <div className="field-row">
              <label className="form-label">Payment method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Not set</option>
                <option>Direct Debit</option>
                <option>BACS</option>
                <option>Card</option>
                <option>Invoice</option>
                <option>Cheque</option>
              </select>
            </div>

            <div className="field-row">
              <label className="form-label">Contact name</label>
              <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Account manager / contact" />
            </div>

            <div className="field-row" style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Phone</label>
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Email</label>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
            </div>

            <div className="field-row">
              <label className="form-label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Active</option>
                <option>Pending</option>
                <option>Expired</option>
                <option>Cancelled</option>
              </select>
            </div>

            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} placeholder="Comparison notes, last quote, switching reasons…" />
            </div>

            <div className="modal-btns">
              <button className="btn-primary" onClick={save}>{editId ? 'Save changes' : 'Add'}</button>
              <button className="btn-cancel" onClick={() => { resetForm(); setModal(false); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
