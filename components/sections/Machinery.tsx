'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { MachineryRecord } from '@/lib/types';
import { fmtDate, fmtMoney, uid, daysUntil } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const MACHINES = ['Combine harvester', 'Tractor 1', 'Tractor 2', 'Tractor 3', 'Tractor 4', 'Forklift 1', 'Forklift 2'];

export default function Machinery({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [machine, setMachine] = useState('Combine harvester');
  const [customMachine, setCustomMachine] = useState('');
  const [serviceType, setServiceType] = useState('Annual service');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [nextServiceDate, setNextServiceDate] = useState('');
  const [notes, setNotes] = useState('');

  const machinery = db.machinery || [];

  const uniqueMachines = Array.from(new Set(machinery.map(m => m.machine))).concat(MACHINES).sort();

  function saveMachinery() {
    const machineNameToUse = machine === 'Custom' ? customMachine.trim() : machine;
    if (!machineNameToUse || !serviceType || !date || !description) return alert('Machine, service type, date, and description required');

    const record: MachineryRecord = {
      id: uid(),
      machine: machineNameToUse,
      serviceType,
      date,
      hours,
      description,
      cost: parseFloat(cost) || 0,
      supplier: supplier.trim(),
      nextServiceDate,
      notes
    };

    addActivity(`Recorded service: ${machineNameToUse}`);
    persist({ ...db, machinery: [...machinery, record] });
    resetForm();
    setModal(false);
  }

  function resetForm() {
    setMachine('Combine harvester');
    setCustomMachine('');
    setServiceType('Annual service');
    setDate(new Date().toISOString().slice(0, 10));
    setHours('');
    setDescription('');
    setCost('');
    setSupplier('');
    setNextServiceDate('');
    setNotes('');
  }

  function deleteMachinery(id: string) {
    if (!confirm('Delete this record?')) return;
    persist({ ...db, machinery: machinery.filter(m => m.id !== id) });
  }

  const grouped = uniqueMachines.reduce((acc, m) => {
    acc[m] = machinery.filter(r => r.machine === m);
    return acc;
  }, {} as Record<string, MachineryRecord[]>);

  const overdue = machinery.filter(m => {
    if (!m.nextServiceDate) return false;
    return new Date(m.nextServiceDate + 'T12:00:00') < new Date();
  });

  const dueSoon = machinery.filter(m => {
    if (!m.nextServiceDate || overdue.some(o => o.id === m.id)) return false;
    const days = daysUntil(m.nextServiceDate);
    return days >= 0 && days <= 30;
  });

  return (
    <>
      <button className="btn-add" onClick={() => { resetForm(); setModal(true); }} style={{ marginBottom: '1rem' }}>
        + Add service record
      </button>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total records</div>
          <div className="metric-value">{machinery.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Overdue services</div>
          <div className="metric-value" style={{ color: overdue.length > 0 ? 'var(--red)' : 'inherit' }}>{overdue.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Due within 30 days</div>
          <div className="metric-value" style={{ color: dueSoon.length > 0 ? 'var(--amber)' : 'inherit' }}>{dueSoon.length}</div>
        </div>
      </div>

      {Object.entries(grouped).map(([machineName, records]) => (
        <div key={machineName} className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title">{machineName}</div>
          {records.length === 0
            ? <div className="empty">No service records.</div>
            : records.map(r => {
              const isOverdue = r.nextServiceDate && new Date(r.nextServiceDate + 'T12:00:00') < new Date();
              const daysUntilService = r.nextServiceDate ? daysUntil(r.nextServiceDate) : null;
              const isDueSoon = daysUntilService !== null && daysUntilService >= 0 && daysUntilService <= 30;

              return (
                <div key={r.id} className="row-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-name">{r.description}</div>
                    <div className="row-sub">
                      {fmtDate(r.date)} · {r.serviceType}
                      {r.cost > 0 && ` · ${fmtMoney(r.cost)}`}
                      {r.nextServiceDate && ` · Next: ${fmtDate(r.nextServiceDate)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {isOverdue && <span className="badge bg-red" style={{ fontSize: 10 }}>Overdue</span>}
                    {isDueSoon && !isOverdue && <span className="badge bg-amber" style={{ fontSize: 10 }}>Due soon</span>}
                    <button className="del-btn" onClick={() => deleteMachinery(r.id)}>×</button>
                  </div>
                </div>
              );
            })
          }
        </div>
      ))}

      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Add service record</div>

            <div className="field-row">
              <label className="form-label">Machine</label>
              <select value={machine} onChange={(e) => setMachine(e.target.value)}>
                {MACHINES.map(m => <option key={m}>{m}</option>)}
                <option>Custom</option>
              </select>
              {machine === 'Custom' && (
                <input
                  type="text"
                  value={customMachine}
                  onChange={(e) => setCustomMachine(e.target.value)}
                  placeholder="Machine name"
                  style={{ marginTop: '0.5rem' }}
                />
              )}
            </div>

            <div className="field-row">
              <label className="form-label">Service type</label>
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                <option>Annual service</option>
                <option>Repair</option>
                <option>MOT</option>
                <option>Pre-season check</option>
                <option>Other</option>
              </select>
            </div>

            <div className="field-row">
              <label className="form-label">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="field-row">
              <label className="form-label">Hours / Mileage</label>
              <input type="text" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g., 1,250 hours" />
            </div>

            <div className="field-row">
              <label className="form-label">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was done" />
            </div>

            <div className="field-row">
              <label className="form-label">Cost (£)</label>
              <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" step="0.01" />
            </div>

            <div className="field-row">
              <label className="form-label">Supplier / Garage</label>
              <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>

            <div className="field-row">
              <label className="form-label">Next service date</label>
              <input type="date" value={nextServiceDate} onChange={(e) => setNextServiceDate(e.target.value)} />
            </div>

            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
            </div>

            <div className="modal-btns">
              <button className="btn-primary" onClick={saveMachinery}>Add</button>
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
