'use client';

import { useState } from 'react';
import { FarmData, Utility } from '@/lib/types';
import { fmtDate, fmtMoney, uid, daysUntil } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const UTILITY_PRESETS = [
  'Electricity - Stonor Valley/Upper Assendon',
  'Water - Thames Water',
  'Grain storage - Heygates',
  'Vehicle insurance',
  'Farm insurance',
  'Broadband'
];

export default function Utilities({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [customName, setCustomName] = useState('');
  const [provider, setProvider] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [startDate, setStartDate] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [annualCost, setAnnualCost] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Active');

  const utilities = db.utilities || [];

  const totalCost = utilities
    .filter(u => u.status === 'Active')
    .reduce((a, b) => a + (b.annualCost || 0), 0);

  function saveUtility() {
    const nameToUse = name === 'Other' ? customName.trim() : name;
    if (!nameToUse || !provider.trim() || !renewalDate || !annualCost) {
      return alert('Name, provider, renewal date, and annual cost required');
    }

    const record: Utility = {
      id: uid(),
      name: nameToUse,
      provider: provider.trim(),
      accountRef: accountRef.trim(),
      startDate,
      renewalDate,
      annualCost: parseFloat(annualCost) || 0,
      notes,
      status
    };

    addActivity(`Added utility: ${nameToUse}`);
    persist({ ...db, utilities: [...utilities, record] });
    resetForm();
    setModal(false);
  }

  function resetForm() {
    setName('');
    setCustomName('');
    setProvider('');
    setAccountRef('');
    setStartDate('');
    setRenewalDate('');
    setAnnualCost('');
    setNotes('');
    setStatus('Active');
  }

  function deleteUtility(id: string) {
    if (!confirm('Delete this utility?')) return;
    persist({ ...db, utilities: utilities.filter(u => u.id !== id) });
  }

  const sorted = [...utilities].sort((a, b) => (a.renewalDate || '').localeCompare(b.renewalDate || ''));

  return (
    <>
      <button className="btn-add" onClick={() => { resetForm(); setModal(true); }} style={{ marginBottom: '1rem' }}>
        + Add utility contract
      </button>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total contracts</div>
          <div className="metric-value">{utilities.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Annual cost</div>
          <div className="metric-value">{fmtMoney(totalCost)}</div>
          <div className="metric-sub">active contracts</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Utility contracts</div>
        {sorted.length === 0
          ? <div className="empty">No utilities registered.</div>
          : sorted.map(u => {
            const daysLeft = daysUntil(u.renewalDate);
            let color = 'bg-green';
            if (daysLeft < 30) color = 'bg-red';
            else if (daysLeft < 90) color = 'bg-amber';

            return (
              <div key={u.id} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name">{u.name}</div>
                  <div className="row-sub">
                    {u.provider}
                    {u.accountRef && ` · ${u.accountRef}`}
                    {' · '}{fmtMoney(u.annualCost)}/year
                    {u.renewalDate && ` · Renews ${fmtDate(u.renewalDate)} (${Math.max(0, daysLeft)} days)`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span className={`badge ${color}`} style={{ fontSize: 10 }}>{u.status}</span>
                  <button className="del-btn" onClick={() => deleteUtility(u.id)}>×</button>
                </div>
              </div>
            );
          })
        }
      </div>

      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Add utility contract</div>

            <div className="field-row">
              <label className="form-label">Utility type</label>
              <select value={name} onChange={(e) => setName(e.target.value)}>
                <option value="">Select utility</option>
                {UTILITY_PRESETS.map(p => <option key={p}>{p}</option>)}
                <option value="Other">Other</option>
              </select>
              {name === 'Other' && (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Utility name"
                  style={{ marginTop: '0.5rem' }}
                />
              )}
            </div>

            <div className="field-row">
              <label className="form-label">Provider</label>
              <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Company name" />
            </div>

            <div className="field-row">
              <label className="form-label">Account reference</label>
              <input type="text" value={accountRef} onChange={(e) => setAccountRef(e.target.value)} placeholder="Account / Policy number" />
            </div>

            <div className="field-row">
              <label className="form-label">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div className="field-row">
              <label className="form-label">Renewal date</label>
              <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
            </div>

            <div className="field-row">
              <label className="form-label">Annual cost (£)</label>
              <input
                type="number"
                value={annualCost}
                onChange={(e) => setAnnualCost(e.target.value)}
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div className="field-row">
              <label className="form-label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Active</option>
                <option>Expired</option>
                <option>Cancelled</option>
              </select>
            </div>

            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
            </div>

            <div className="modal-btns">
              <button className="btn-primary" onClick={saveUtility}>Add</button>
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
