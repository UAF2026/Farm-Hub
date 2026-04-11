'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { Cattle } from '@/lib/types';
import { fmtDate, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const BREED_CODES: Record<string, string> = {
  WA: 'Wagyu', WAX: 'Wagyu cross', AA: 'Aberdeen Angus', AAX: 'Aberdeen Angus cross',
  BA: 'Belgian Blue', BAX: 'Belgian Blue cross', CA: 'Charolais', CAX: 'Charolais cross',
  HE: 'Hereford', HEX: 'Hereford cross', LI: 'Limousin', LIM: 'Limousin', LX: 'Limousin cross',
  SI: 'Simmental', SIM: 'Simmental', SX: 'Simmental cross', FH: 'Friesian Holstein',
  HF: 'Holstein Friesian', FR: 'Friesian', SL: 'South Devon', DE: 'Dexter', HH: 'Highland',
  GA: 'Galloway', SH: 'Shorthorn', SP: 'Speckle Park', MU: 'Murray Grey', JE: 'Jersey', GG: 'Guernsey', AY: 'Ayrshire'
};

export default function Livestock({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [csvModal, setCsvModal] = useState(false);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [type, setType] = useState('');
  const [breed, setBreed] = useState('');
  const [dob, setDob] = useState('');
  const [notes, setNotes] = useState('');
  const [importMsg, setImportMsg] = useState('');

  const cattle = db.cattle || [];
  const cows = cattle.filter(c => c.type === 'Breeding cow').length;
  const bulls = cattle.filter(c => c.type === 'Bull').length;
  const followers = cattle.filter(c => ['Calf', 'Heifer'].includes(c.type)).length;

  const filtered = cattle.filter(c =>
    c.tag.toUpperCase().includes(search.toUpperCase()) ||
    c.breed.toUpperCase().includes(search.toUpperCase()) ||
    c.type.toUpperCase().includes(search.toUpperCase())
  );

  function addCattle() {
    if (!tag.trim() || !type || !breed) return alert('Tag, type and breed required');
    const cleanTag = tag.toUpperCase().trim();
    if (cattle.some(c => c.tag.toUpperCase() === cleanTag)) return alert('This tag already exists');
    const animal: Cattle = { tag: cleanTag, type, breed, dob, notes };
    addActivity(`Added cattle: ${cleanTag} (${breed})`);
    persist({ ...db, cattle: [...cattle, animal] });
    setModal(false);
    setTag(''); setType(''); setBreed(''); setDob(''); setNotes('');
  }

  function parseCTSCSV(text: string) {
    const lines = text.split('\n').filter(l => l.trim());
    const added: Cattle[] = [];
    const seen = new Set<string>();

    lines.forEach(line => {
      const cols = line.split(',').map(c => c.trim());
      if (cols[1] !== 'A' || !cols[3]?.startsWith('UK')) return;

      const tag = cols[3].toUpperCase();
      if (seen.has(tag.replace(/\s/g, '').toUpperCase())) return;
      seen.add(tag.replace(/\s/g, '').toUpperCase());

      let dobStr = '';
      if (cols[6]) {
        const parts = cols[6].includes('/') ? cols[6].split('/') : cols[6].split('-');
        if (parts.length === 3) dobStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      const breedCode = cols[4]?.toUpperCase() || '';
      const breedName = BREED_CODES[breedCode] || breedCode || 'Mixed';
      const sex = cols[5]?.toUpperCase() || '';

      let animalType = 'Other';
      if (dobStr) {
        const age = Math.floor((Date.now() - new Date(dobStr).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (sex === 'M') {
          if (age < 1) animalType = 'Calf';
          else if (age < 2) animalType = 'Bull';
          else animalType = 'Bull';
        } else if (sex === 'F') {
          if (age < 1) animalType = 'Calf';
          else if (age < 2) animalType = 'Heifer';
          else animalType = 'Breeding cow';
        }
      }

      let notes = '';
      if (cols[7]) notes += `Dam: ${cols[7]} `;
      if (cols[9]) notes += `Sire: ${cols[9]}`;

      added.push({ tag, type: animalType, breed: breedName, dob: dobStr, notes: notes.trim(), source: 'CTS' });
    });

    const newCattle = cattle.filter(c => !seen.has(c.tag.replace(/\s/g, '').toUpperCase()));
    const allCattle = [...newCattle, ...added];
    addActivity(`Imported ${added.length} animals from CTS CSV`);
    persist({ ...db, cattle: allCattle });
    setImportMsg(`Imported ${added.length} animals`);
    setTimeout(() => setImportMsg(''), 9000);
    setCsvModal(false);
  }

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCTSCSV(text);
    };
    reader.readAsText(file);
  }

  function deleteCattle(tag: string) {
    if (!confirm(`Delete ${tag}?`)) return;
    persist({ ...db, cattle: cattle.filter(c => c.tag !== tag) });
  }

  function getTypeColor(t: string): string {
    if (t === 'Bull') return 'bg-amber';
    if (t === 'Breeding cow') return 'bg-green';
    return 'bg-blue';
  }

  function clearAll() {
    if (!confirm('Remove all cattle? This cannot be undone.')) return;
    addActivity('Cleared all cattle');
    persist({ ...db, cattle: [] });
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="btn-add" onClick={() => setModal(true)}>+ Add cattle</button>
        <button className="btn-primary" onClick={() => setCsvModal(true)}>📥 Import CTS CSV</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={clearAll}>🗑 Clear all</button>
      </div>

      {importMsg && <div style={{ background: 'var(--green)', color: 'white', padding: '0.5rem 1rem', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>{importMsg}</div>}

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Breeding cows</div>
          <div className="metric-value">{cows}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Bulls</div>
          <div className="metric-value">{bulls}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Followers</div>
          <div className="metric-value">{followers}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total</div>
          <div className="metric-value">{cattle.length}</div>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by tag, breed, or type..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
      />

      <div className="card">
        <div className="card-title">Cattle</div>
        {filtered.length === 0
          ? <div className="empty">{cattle.length === 0 ? 'No cattle registered.' : 'No matches.'}</div>
          : filtered.map(c => (
            <div key={c.tag} className="row-item">
              <div style={{ flex: 1 }}>
                <div className="row-name">{c.tag}</div>
                <div className="row-sub">{c.breed} · DOB {c.dob ? fmtDate(c.dob) : 'Unknown'}{c.notes ? ' · ' + c.notes : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span className={`badge ${getTypeColor(c.type)}`}>{c.type}</span>
                <button className="del-btn" onClick={() => deleteCattle(c.tag)}>×</button>
              </div>
            </div>
          ))
        }
      </div>

      {modal && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Add cattle</div>
            <div className="field-row">
              <label className="form-label">Tag</label>
              <input type="text" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="UK123456..." />
            </div>
            <div className="field-row">
              <label className="form-label">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Select type</option>
                <option>Bull</option>
                <option>Breeding cow</option>
                <option>Heifer</option>
                <option>Calf</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Breed</label>
              <input type="text" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g., Wagyu" />
            </div>
            <div className="field-row">
              <label className="form-label">Date of Birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dam, sire, etc." style={{ minHeight: 60 }} />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={addCattle}>Add</button>
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {csvModal && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setCsvModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Import CTS CSV</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>Download your CTS export and select the CSV file. Duplicates will be skipped.</p>
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
            />
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setCsvModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
