'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { Field } from '@/lib/types';
import { fmtDate, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const RPA_FIELDS: Field[] = [
  { name: "SU7186 0262", area: 5.83, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, LIG1", parcel: "SU7186 0262" },
  { name: "SU7196 5083", area: 47.03, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7196 5083" },
  { name: "SU7285 4854", area: 20.59, status: "Legume fallow", crop: "", notes: "SFI: SAM1, HRW1, NUM3", parcel: "SU7285 4854" },
  { name: "SU7287 5465", area: 10.28, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7287 5465" },
  { name: "SU7287 5893", area: 20.67, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7287 5893" },
  { name: "SU7287 6039", area: 1.3, status: "Grass", crop: "", notes: "SFI: SAM1, IGL2", parcel: "SU7287 6039" },
  { name: "SU7287 7507", area: 10.29, status: "Grass", crop: "", notes: "CS: GS6 species-rich grassland", parcel: "SU7287 7507" },
  { name: "SU7288 3915", area: 1.11, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, IGL2", parcel: "SU7288 3915" },
  { name: "SU7288 4543", area: 9.17, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7288 4543" },
  { name: "SU7288 5509", area: 1.01, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1", parcel: "SU7288 5509" },
  { name: "SU7288 6817", area: 6.21, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7288 6817" },
  { name: "SU7291 1295", area: 20.52, status: "In crop", crop: "", notes: "SFI: SAM1, IPM4, SOH1, PRF1", parcel: "SU7291 1295" },
  { name: "SU7291 4760", area: 3.82, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, IGL2, CS: GS3", parcel: "SU7291 4760" },
  { name: "SU7291 5575", area: 12.05, status: "In crop", crop: "", notes: "SFI: SAM1, IPM4, SOH1, PRF1", parcel: "SU7291 5575" },
  { name: "SU7291 6235", area: 14.01, status: "In crop", crop: "", notes: "SFI: SAM1, IPM4, SOH1, PRF1", parcel: "SU7291 6235" },
  { name: "SU7291 8051", area: 2.57, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, IGL2", parcel: "SU7291 8051" },
  { name: "SU7291 9029", area: 13.75, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7291 9029" },
  { name: "SU7292 5848", area: 21.46, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7292 5848" },
  { name: "SU7292 9020", area: 12.17, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7292 9020" },
  { name: "SU7386 9010", area: 11.36, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7386 9010" },
  { name: "SU7387 0753", area: 11.73, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7387 0753" },
  { name: "SU7387 1312", area: 11.82, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, LIG1", parcel: "SU7387 1312" },
  { name: "SU7387 2735", area: 4.53, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, LIG1", parcel: "SU7387 2735" },
  { name: "SU7387 3433", area: 1.13, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, CAHL2", parcel: "SU7387 3433" },
  { name: "SU7387 3575", area: 8.65, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, AHW5 lapwing plots", parcel: "SU7387 3575" },
  { name: "SU7387 4742", area: 6.01, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7387 4742" },
  { name: "SU7387 6074", area: 11.58, status: "Cover crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1, SOH3", parcel: "SU7387 6074" },
  { name: "SU7387 7025", area: 11.52, status: "Cover crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1, SOH3", parcel: "SU7387 7025" },
  { name: "SU7387 7575", area: 14.25, status: "Cover crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1, SOH3", parcel: "SU7387 7575" },
  { name: "SU7387 9845", area: 13.31, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, CAHL2", parcel: "SU7387 9845" },
  { name: "SU7387 9880", area: 1.95, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1", parcel: "SU7387 9880" },
  { name: "SU7388 1965", area: 8.27, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, LIG1", parcel: "SU7388 1965" },
  { name: "SU7388 2327", area: 9.47, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7388 2327" },
  { name: "SU7388 2347", area: 2.67, status: "In crop", crop: "", notes: "SFI: SAM1, IPM4", parcel: "SU7388 2347" },
  { name: "SU7388 2505", area: 8.99, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7388 2505" },
  { name: "SU7388 3548", area: 0.45, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1", parcel: "SU7388 3548" },
  { name: "SU7388 5060", area: 6.26, status: "Herbal ley", crop: "", notes: "SFI: SAM1, HRW1, SAM3 herbal ley", parcel: "SU7388 5060" },
  { name: "SU7388 5320", area: 4.1, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, LIG1", parcel: "SU7388 5320" },
  { name: "SU7388 6337", area: 0.29, status: "In crop", crop: "", notes: "SFI: SAM1", parcel: "SU7388 6337" },
  { name: "SU7388 9802", area: 5.72, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4", parcel: "SU7388 9802" },
  { name: "SU7391 1075", area: 8.65, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, CS: GS6 species-rich grassland", parcel: "SU7391 1075" },
  { name: "SU7479 3989", area: 7.18, status: "Grass", crop: "", notes: "SFI: SAM1, IGL2 winter bird food", parcel: "SU7479 3989" },
  { name: "SU7479 6483", area: 15.82, status: "Grass", crop: "", notes: "SFI: SAM1, IGL2 winter bird food", parcel: "SU7479 6483" },
  { name: "SU7485 1297", area: 6.56, status: "In crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1", parcel: "SU7485 1297" },
  { name: "SU7486 2085", area: 15.42, status: "Cover crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1, SOH3", parcel: "SU7486 2085" },
  { name: "SU7487 1809", area: 8.26, status: "Cover crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1, SOH3", parcel: "SU7487 1809" },
  { name: "SU7487 2040", area: 17.24, status: "Cover crop", crop: "", notes: "SFI: SAM1, HRW1, IPM4, SOH1, PRF1, SOH3", parcel: "SU7487 2040" },
  { name: "SU7488 0415", area: 0.49, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, IGL2", parcel: "SU7488 0415" },
  { name: "SU7488 0431", area: 0.7, status: "In crop", crop: "", notes: "SFI: SAM1", parcel: "SU7488 0431" },
  { name: "SU7488 1509", area: 5.04, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, CS: GS3", parcel: "SU7488 1509" },
  { name: "SU7488 1841", area: 2.56, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, CS: GS3", parcel: "SU7488 1841" },
  { name: "SU7488 3432", area: 4.79, status: "Grass", crop: "", notes: "SFI: SAM1, HRW1, CS: GS3", parcel: "SU7488 3432" }
];

const BIX_HALL_FIELDS: Field[] = [
  { name: "Soundess", area: 7.2, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-Soundess" },
  { name: "Barn", area: 9.4, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-Barn" },
  { name: "Lunch", area: 6.8, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-Lunch" },
  { name: "Black Dean & Pages", area: 12.1, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-BlackDean" },
  { name: "Top East", area: 5.3, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-TopEast" },
  { name: "Bottom Top East", area: 4.9, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-BottomTopEast" },
  { name: "Home", area: 8.6, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-Home" },
  { name: "Freedom", area: 3.55, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-Freedom" },
  { name: "Church", area: 6.9, status: "In crop", crop: "Winter wheat", notes: "Bix Hall", parcel: "BIX-Church" }
];

export default function Crops({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('In crop');
  const [crop, setCrop] = useState('');
  const [notes, setNotes] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const fields = db.fields || [];

  const totalHa = fields.reduce((a, b) => a + (b.area || 0), 0);
  const inCropHa = fields.filter(f => f.status === 'In crop').reduce((a, b) => a + (b.area || 0), 0);
  const grassHa = fields.filter(f => f.status === 'Grass').reduce((a, b) => a + (b.area || 0), 0);

  function saveField() {
    if (!name.trim() || !area) return alert('Name and area required');
    const a = parseFloat(area);
    if (isNaN(a) || a <= 0) return alert('Area must be a positive number');

    const newField: Field = { name: name.trim(), area: a, status, crop, notes };

    if (editIdx !== null) {
      const updated = [...fields];
      updated[editIdx] = newField;
      persist({ ...db, fields: updated });
      setEditIdx(null);
    } else {
      persist({ ...db, fields: [...fields, newField] });
    }

    addActivity(`${editIdx !== null ? 'Updated' : 'Added'} field: ${name}`);
    setModal(false);
    setName(''); setArea(''); setStatus('In crop'); setCrop(''); setNotes('');
  }

  function editField(idx: number) {
    const f = fields[idx];
    setName(f.name);
    setArea(String(f.area));
    setStatus(f.status);
    setCrop(f.crop);
    setNotes(f.notes);
    setEditIdx(idx);
    setModal(true);
  }

  function deleteField(idx: number) {
    if (!confirm(`Delete ${fields[idx].name}?`)) return;
    persist({ ...db, fields: fields.filter((_, i) => i !== idx) });
  }

  function loadRPA() {
    const newFields = fields.filter(f => !RPA_FIELDS.some(rf => rf.parcel === f.parcel));
    const all = [...newFields, ...RPA_FIELDS];
    addActivity(`Loaded ${RPA_FIELDS.length} RPA fields`);
    persist({ ...db, fields: all });
  }

  function loadBixHall() {
    const newFields = fields.filter(f => !BIX_HALL_FIELDS.some(bf => bf.parcel === f.parcel));
    const all = [...newFields, ...BIX_HALL_FIELDS];
    addActivity(`Loaded ${BIX_HALL_FIELDS.length} Bix Hall fields`);
    persist({ ...db, fields: all });
  }

  function getStatusColor(s: string): string {
    if (s === 'In crop') return 'bg-green';
    if (s === 'Grass') return 'bg-blue';
    if (s === 'Cover crop') return 'bg-amber';
    return 'bg-gray';
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="btn-add" onClick={() => { setEditIdx(null); setModal(true); }}>+ Add field</button>
        <button className="btn-primary" onClick={loadRPA}>Load RPA agreement fields</button>
        <button className="btn-primary" onClick={loadBixHall}>Load Bix Hall fields</button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total fields</div>
          <div className="metric-value">{fields.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total area</div>
          <div className="metric-value">{totalHa.toFixed(1)}ha</div>
          <div className="metric-sub">{(totalHa * 2.471).toFixed(0)} acres</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">In crop</div>
          <div className="metric-value">{inCropHa.toFixed(1)}ha</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Grass</div>
          <div className="metric-value">{grassHa.toFixed(1)}ha</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Fields</div>
        {fields.length === 0
          ? <div className="empty">No fields registered.</div>
          : fields.map((f, i) => (
            <div key={i} className="row-item" onClick={() => editField(i)} style={{ cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div className="row-name">{f.name}</div>
                <div className="row-sub">{f.area.toFixed(1)}ha ({(f.area * 2.471).toFixed(1)}ac) · {f.crop || 'No crop'}{f.notes ? ' · ' + f.notes : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span className={`badge ${getStatusColor(f.status)}`}>{f.status}</span>
                <button className="del-btn" onClick={(e) => { e.stopPropagation(); deleteField(i); }}>×</button>
              </div>
            </div>
          ))
        }
      </div>

      <div className="grid2">
        <div className="link-card">
          <div className="link-group-title">Arable links</div>
          <a href="https://ahdb.org.uk/cereals-and-oilseeds" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">AHDB Cereals</div>
              <div className="link-desc">Market data and best practice</div>
            </div>
          </a>
          <a href="https://www.pesticides.gov.uk" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">Pesticide Register</div>
              <div className="link-desc">Check spray approvals</div>
            </div>
          </a>
        </div>

        <div className="link-card">
          <div className="link-group-title">Grain prices</div>
          <a href="https://www.farminguk.com/prices" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">Farming UK Prices</div>
              <div className="link-desc">Wheat, barley, oats quotes</div>
            </div>
          </a>
          <a href="https://www.nfuonline.com" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">NFU Online</div>
              <div className="link-desc">Price trends and analysis</div>
            </div>
          </a>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">{editIdx !== null ? 'Edit' : 'Add'} field</div>
            <div className="field-row">
              <label className="form-label">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Field name" />
            </div>
            <div className="field-row">
              <label className="form-label">Area (hectares)</label>
              <input type="number" value={area} onChange={(e) => setArea(e.target.value)} placeholder="0.0" step="0.1" />
            </div>
            <div className="field-row">
              <label className="form-label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>In crop</option>
                <option>Grass</option>
                <option>Fallow</option>
                <option>Cover crop</option>
                <option>Herbal ley</option>
                <option>Legume fallow</option>
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Crop</label>
              <input type="text" value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Winter wheat, etc." />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Parcel code, SFI details, etc." style={{ minHeight: 60 }} />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={saveField}>Save</button>
              <button className="btn-cancel" onClick={() => { setModal(false); setEditIdx(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
