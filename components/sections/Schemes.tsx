'use client';

import { useState } from 'react';
import { FarmData, Scheme } from '@/lib/types';
import { fmtDate, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

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

export default function Schemes({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<'High priority' | 'Medium priority' | 'Low priority'>('Medium priority');
  const [notes, setNotes] = useState('');

  const schemes = db.schemes || [];
  const sorted = [...schemes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

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

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="btn-add" onClick={() => setModal(true)}>+ Add reminder</button>
        <button className="btn-primary" onClick={loadSchemes}>Load CS & SFI reminders</button>
      </div>

      <div className="card">
        <div className="card-title">Scheme reminders</div>
        {sorted.length === 0
          ? <div className="empty">No reminders set.</div>
          : sorted.map((s, i) => (
            <div key={i} className="row-item">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' }}>
                <div className={`dot ${getPriorityColor(s.priority)}`} style={{ flexShrink: 0, marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-name" style={{ fontSize: 13 }}>{s.name}</div>
                  <div className="row-sub">{fmtDate(s.date)}</div>
                  {s.notes && <div className="row-sub" style={{ fontSize: 12, marginTop: 4 }}>{s.notes}</div>}
                </div>
                <button className="del-btn" onClick={() => deleteScheme(i)} style={{ flexShrink: 0 }}>×</button>
              </div>
            </div>
          ))
        }
      </div>

      <div className="link-grid">
        <div className="link-card">
          <div className="link-group-title">Scheme links</div>
          <a href="https://www.gov.uk/government/collections/sustainable-farming-incentive-guidance" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">SFI guidance</div>
              <div className="link-desc">Rules and payments</div>
            </div>
          </a>
          <a href="https://www.gov.uk/government/collections/countryside-stewardship-get-paid-to-look-after-the-countryside" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">CS guidance</div>
              <div className="link-desc">Agreement management</div>
            </div>
          </a>
          <a href="https://www.ruralpayments.org" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">Rural Payments</div>
              <div className="link-desc">Submit claims online</div>
            </div>
          </a>
          <a href="https://www.gov.uk/guidance/bovine-tb-get-your-cattle-tested" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">Bovine TB</div>
              <div className="link-desc">Testing and compliance</div>
            </div>
          </a>
          <a href="https://www.gov.uk/guidance/farming-investment-fund" target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1 }}>
              <div className="link-name">Farming Investment Fund</div>
              <div className="link-desc">Equipment grants</div>
            </div>
          </a>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
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
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
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
