'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { MedicineRecord } from '@/lib/types';
import { fmtDate, uid, daysUntil } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

export default function Medicine({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [animal, setAnimal] = useState('');
  const [product, setProduct] = useState('');
  const [batch, setBatch] = useState('');
  const [dose, setDose] = useState('');
  const [route, setRoute] = useState('Injection');
  const [withdrawalMeat, setWithdrawalMeat] = useState('0');
  const [withdrawalMilk, setWithdrawalMilk] = useState('0');
  const [vet, setVet] = useState('');
  const [notes, setNotes] = useState('');

  const medicine = db.medicine || [];
  const cattle = db.cattle || [];

  function saveMedicine() {
    if (!animal.trim() || !product.trim() || !dose.trim()) return alert('Animal, product, and dose required');

    const record: MedicineRecord = {
      id: uid(),
      date,
      animal: animal.toUpperCase(),
      product,
      batch,
      dose,
      route,
      withdrawalMeat: parseInt(withdrawalMeat) || 0,
      withdrawalMilk: parseInt(withdrawalMilk) || 0,
      vet,
      notes
    };

    addActivity(`Recorded medicine: ${product} for ${animal}`);
    persist({ ...db, medicine: [...medicine, record] });
    resetForm();
    setModal(false);
  }

  function resetForm() {
    setDate(new Date().toISOString().slice(0, 10));
    setAnimal('');
    setProduct('');
    setBatch('');
    setDose('');
    setRoute('Injection');
    setWithdrawalMeat('0');
    setWithdrawalMilk('0');
    setVet('');
    setNotes('');
  }

  function deleteMedicine(id: string) {
    if (!confirm('Delete this record?')) return;
    persist({ ...db, medicine: medicine.filter(m => m.id !== id) });
  }

  const inWithdrawal = medicine.filter(m => {
    if (m.withdrawalMeat <= 0) return false;
    const clearDate = new Date(m.date + 'T12:00:00');
    clearDate.setDate(clearDate.getDate() + m.withdrawalMeat);
    return clearDate > new Date();
  });

  return (
    <>
      <button className="btn-add" onClick={() => { resetForm(); setModal(true); }} style={{ marginBottom: '1rem' }}>
        + Add medicine record
      </button>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total records</div>
          <div className="metric-value">{medicine.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Animals in withdrawal</div>
          <div className="metric-value">{new Set(inWithdrawal.map(m => m.animal)).size}</div>
          <div className="metric-sub">meat withdrawal</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Medicine records</div>
        {medicine.length === 0
          ? <div className="empty">No medicine records.</div>
          : medicine.map(m => {
            const clearDate = new Date(m.date + 'T12:00:00');
            clearDate.setDate(clearDate.getDate() + m.withdrawalMeat);
            const daysRemaining = m.withdrawalMeat > 0 ? daysUntil(clearDate.toISOString().slice(0, 10)) : -1;
            const inWithdrawal = daysRemaining >= 0;

            return (
              <div key={m.id} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name">{m.product}</div>
                  <div className="row-sub">
                    {m.animal} · {fmtDate(m.date)} · {m.dose} {m.route}
                    {inWithdrawal && ` · Withdrawal: ${daysRemaining + 1} days`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {inWithdrawal && <span className="badge bg-amber" style={{ fontSize: 10 }}>Withdrawal</span>}
                  <button className="del-btn" onClick={() => deleteMedicine(m.id)}>×</button>
                </div>
              </div>
            );
          })
        }
      </div>

      {modal && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Add medicine record</div>

            <div className="field-row">
              <label className="form-label">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="field-row">
              <label className="form-label">Animal (ear tag)</label>
              <input
                type="text"
                value={animal}
                onChange={(e) => setAnimal(e.target.value)}
                placeholder="UK123456"
                list="cattle-tags"
              />
              <datalist id="cattle-tags">
                {cattle.map(c => <option key={c.tag} value={c.tag} />)}
              </datalist>
            </div>

            <div className="field-row">
              <label className="form-label">Product name</label>
              <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Medicine name" />
            </div>

            <div className="field-row">
              <label className="form-label">Batch number</label>
              <input type="text" value={batch} onChange={(e) => setBatch(e.target.value)} />
            </div>

            <div className="field-row">
              <label className="form-label">Dose</label>
              <input type="text" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g., 10ml" />
            </div>

            <div className="field-row">
              <label className="form-label">Route</label>
              <select value={route} onChange={(e) => setRoute(e.target.value)}>
                <option>Oral</option>
                <option>Injection</option>
                <option>Topical</option>
                <option>Other</option>
              </select>
            </div>

            <div className="field-row">
              <label className="form-label">Withdrawal period - meat (days)</label>
              <input
                type="number"
                value={withdrawalMeat}
                onChange={(e) => setWithdrawalMeat(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="field-row">
              <label className="form-label">Withdrawal period - milk (days)</label>
              <input
                type="number"
                value={withdrawalMilk}
                onChange={(e) => setWithdrawalMilk(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="field-row">
              <label className="form-label">Vet/prescriber</label>
              <input type="text" value={vet} onChange={(e) => setVet(e.target.value)} placeholder="Veterinary name" />
            </div>

            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
            </div>

            <div className="modal-btns">
              <button className="btn-primary" onClick={saveMedicine}>Add</button>
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
