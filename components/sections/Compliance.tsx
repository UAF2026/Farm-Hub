'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { SprayRecord, FertiliserRecord, Certificate, ChecklistItem } from '@/lib/types';
import { fmtDate, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

type SubSection = 'overview' | 'sprays' | 'fertilisers' | 'certificates' | 'checklist';

const CERT_CATEGORIES = ['Operator', 'Pesticide', 'Livestock', 'Land', 'Insurance', 'Membership', 'Other'];

const DEFAULT_CERTS = [
  { name: 'BASIS Certificate', category: 'Pesticide', holder: '' },
  { name: 'FACTS Certificate', category: 'Pesticide', holder: '' },
  { name: 'PA1 – Ground sprayer', category: 'Operator', holder: '' },
  { name: 'PA2 – Boom sprayer', category: 'Operator', holder: '' },
  { name: 'PA6 – Knapsack sprayer', category: 'Operator', holder: '' },
  { name: 'Pesticide store certificate', category: 'Pesticide', holder: '' },
  { name: 'Farm insurance', category: 'Insurance', holder: '' },
  { name: 'SAI Global membership', category: 'Membership', holder: '' },
  { name: 'Red Tractor membership', category: 'Membership', holder: '' },
];

const BEEF_CHECKLIST: { section: string; item: string }[] = [
  { section: 'Animal Welfare', item: 'Animals inspected daily and records maintained' },
  { section: 'Animal Welfare', item: 'Five Freedoms policy in place and understood by staff' },
  { section: 'Animal Welfare', item: 'Veterinary Health Plan (VHP) in place and reviewed annually' },
  { section: 'Animal Welfare', item: 'Emergency vet contact details displayed' },
  { section: 'Animal Welfare', item: 'Mortality records kept and disposal documented' },
  { section: 'Animal ID & Movement', item: 'All cattle ear-tagged with official BCMS tags' },
  { section: 'Animal ID & Movement', item: 'CPH number displayed at farm entrance' },
  { section: 'Animal ID & Movement', item: 'Movement documents (AMLs) retained for 3+ years' },
  { section: 'Animal ID & Movement', item: 'Herd register up to date and accurate' },
  { section: 'Animal ID & Movement', item: 'BCMS cattle tracing notifications up to date' },
  { section: 'Medicine & Vet', item: 'Medicine records kept for all treatments (7 year retention)' },
  { section: 'Medicine & Vet', item: 'Withdrawal periods recorded and observed' },
  { section: 'Medicine & Vet', item: 'Medicines stored correctly (fridge temps logged if applicable)' },
  { section: 'Medicine & Vet', item: 'Prescription medicines only used under valid vet prescription' },
  { section: 'Medicine & Vet', item: 'Sharps disposal documented and compliant' },
  { section: 'Feed & Water', item: 'Feed records maintained (source, quantity, dates)' },
  { section: 'Feed & Water', item: 'Clean water available to all animals at all times' },
  { section: 'Feed & Water', item: 'Feed store clean and free from contamination risk' },
  { section: 'Feed & Water', item: 'No prohibited substances (MBM) fed to cattle' },
  { section: 'Housing & Facilities', item: 'Buildings structurally sound and maintained' },
  { section: 'Housing & Facilities', item: 'Adequate space allowances per animal' },
  { section: 'Housing & Facilities', item: 'Slurry/manure storage adequate and not overflowing' },
  { section: 'Housing & Facilities', item: 'Loading facilities safe and fit for purpose' },
  { section: 'Biosecurity', item: 'Biosecurity plan documented' },
  { section: 'Biosecurity', item: 'Visitor records maintained' },
  { section: 'Biosecurity', item: 'Isolation facilities available for new/returning animals' },
];

const ARABLE_CHECKLIST: { section: string; item: string }[] = [
  { section: 'Pesticide Safety', item: 'BASIS-qualified person available for spray advice' },
  { section: 'Pesticide Safety', item: 'All spray operators hold valid PA1 and appropriate certificate' },
  { section: 'Pesticide Safety', item: 'Spray equipment tested and calibrated (within 3 years)' },
  { section: 'Pesticide Safety', item: 'Pesticide store locked, ventilated, bunded' },
  { section: 'Pesticide Safety', item: 'COSHH assessments available for all products used' },
  { section: 'Pesticide Safety', item: 'Personal protective equipment (PPE) available and maintained' },
  { section: 'Spray Records', item: 'Full spray records kept for all applications (7 year retention)' },
  { section: 'Spray Records', item: 'Records include: date, field, product, dose, operator, conditions' },
  { section: 'Spray Records', item: 'Harvest intervals checked and recorded' },
  { section: 'Spray Records', item: 'Buffer zones observed and recorded' },
  { section: 'Fertiliser', item: 'FACTS-qualified person available for nutrient advice' },
  { section: 'Fertiliser', item: 'Nutrient Management Plan (NMP) in place' },
  { section: 'Fertiliser', item: 'Soil tests carried out (within 5 years)' },
  { section: 'Fertiliser', item: 'Fertiliser records kept for all applications' },
  { section: 'Fertiliser', item: 'Closed periods for manure/slurry spreading observed' },
  { section: 'Fertiliser', item: 'Organic manure applications recorded with source and analysis' },
  { section: 'Environment', item: 'Watercourse buffer zones observed (6m uncropped)' },
  { section: 'Environment', item: 'SSSI obligations (if applicable) being met' },
  { section: 'Environment', item: 'Burning restrictions complied with' },
  { section: 'Environment', item: 'Hedgerow management compliant with regulations' },
  { section: 'Traceability', item: 'Field records identify variety, seed lot and provenance' },
  { section: 'Traceability', item: 'Grain store records (in/out) maintained' },
  { section: 'Traceability', item: 'Grain sales documents retained' },
  { section: 'Training & Competence', item: 'All staff training records maintained' },
  { section: 'Training & Competence', item: 'First aid provision adequate' },
  { section: 'Training & Competence', item: 'Risk assessments for key operations documented' },
];

const SPRAY_PURPOSES = ['Herbicide', 'Fungicide', 'Insecticide', 'Growth regulator', 'Desiccant', 'Slug pellets', 'Other'];
const FERT_TYPES = ['Straight N', 'Compound NPK', 'Ammonium nitrate', 'Urea', 'Liquid N', 'Organic manure', 'Digestate', 'FYM', 'Slurry', 'Other'];
const APPLY_METHODS = ['Spreader', 'Sprayer', 'Dribble bar', 'Injection', 'Broadcast', 'Hand application'];

export default function Compliance({ db, persist, addActivity }: Props) {
  const [sub, setSub] = useState<SubSection>('overview');

  // Spray state
  const [sprayModal, setSprayModal] = useState(false);
  const [spDate, setSpDate] = useState(new Date().toISOString().slice(0, 10));
  const [spField, setSpField] = useState('');
  const [spCrop, setSpCrop] = useState('');
  const [spProduct, setSpProduct] = useState('');
  const [spBatch, setSpBatch] = useState('');
  const [spDose, setSpDose] = useState('');
  const [spDoseUnit, setSpDoseUnit] = useState('l/ha');
  const [spArea, setSpArea] = useState('');
  const [spWater, setSpWater] = useState('');
  const [spOperator, setSpOperator] = useState('');
  const [spBasis, setSpBasis] = useState('');
  const [spWind, setSpWind] = useState('');
  const [spTemp, setSpTemp] = useState('');
  const [spHI, setSpHI] = useState('');
  const [spREI, setSpREI] = useState('');
  const [spPurpose, setSpPurpose] = useState('Herbicide');
  const [spNotes, setSpNotes] = useState('');

  // Fertiliser state
  const [fertModal, setFertModal] = useState(false);
  const [feDate, setFeDate] = useState(new Date().toISOString().slice(0, 10));
  const [feField, setFeField] = useState('');
  const [feCrop, setFeCrop] = useState('');
  const [feProduct, setFeProduct] = useState('');
  const [feType, setFeType] = useState('Straight N');
  const [feN, setFeN] = useState('');
  const [feP, setFeP] = useState('');
  const [feK, setFeK] = useState('');
  const [feS, setFeS] = useState('');
  const [feRate, setFeRate] = useState('');
  const [feArea, setFeArea] = useState('');
  const [feOperator, setFeOperator] = useState('');
  const [feMethod, setFeMethod] = useState('Spreader');
  const [feSoil, setFeSoil] = useState('');
  const [feNotes, setFeNotes] = useState('');

  // Certificate state
  const [certModal, setCertModal] = useState(false);
  const [ceeName, setCeeName] = useState('');
  const [ceeHolder, setCeeHolder] = useState('');
  const [ceeCertNo, setCeeCertNo] = useState('');
  const [ceeIssue, setCeeIssue] = useState('');
  const [ceeExpiry, setCeeExpiry] = useState('');
  const [ceeIssuedBy, setCeeIssuedBy] = useState('');
  const [ceeCategory, setCeeCategory] = useState('Operator');
  const [ceeNotes, setCeeNotes] = useState('');

  const [sprayFilter, setSprayFilter] = useState('');
  const [fertFilter, setFertFilter] = useState('');
  const [checklistType, setChecklistType] = useState<'beef' | 'arable'>('beef');

  const sprays = db.sprays || [];
  const fertilisers = db.fertilisers || [];
  const certificates = db.certificates || [];
  const checklist = db.checklist || [];

  // ---- Spray actions ----
  function saveSpray() {
    if (!spField.trim() || !spProduct.trim() || !spDose.trim()) return alert('Field, product, and dose are required');
    const dose = parseFloat(spDose);
    const area = parseFloat(spArea) || 0;
    const item: SprayRecord = {
      id: uid(),
      date: spDate, field: spField.trim(), crop: spCrop.trim(),
      product: spProduct.trim(), batch: spBatch.trim(),
      dose, doseUnit: spDoseUnit, area,
      totalProduct: Math.round(dose * area * 100) / 100,
      waterVolume: parseFloat(spWater) || 0,
      operator: spOperator.trim(), basisCertRef: spBasis.trim(),
      windSpeed: spWind.trim(), temperature: spTemp.trim(),
      harvestInterval: parseFloat(spHI) || 0,
      reEntryInterval: parseFloat(spREI) || 0,
      purpose: spPurpose, notes: spNotes.trim()
    };
    addActivity(`Spray record: ${spProduct} on ${spField}`);
    persist({ ...db, sprays: [...sprays, item] });
    resetSpray();
    setSprayModal(false);
  }

  function resetSpray() {
    setSpDate(new Date().toISOString().slice(0, 10));
    setSpField(''); setSpCrop(''); setSpProduct(''); setSpBatch('');
    setSpDose(''); setSpDoseUnit('l/ha'); setSpArea(''); setSpWater('');
    setSpOperator(''); setSpBasis(''); setSpWind(''); setSpTemp('');
    setSpHI(''); setSpREI(''); setSpPurpose('Herbicide'); setSpNotes('');
  }

  function deleteSpray(id: string) {
    if (!confirm('Delete this spray record?')) return;
    persist({ ...db, sprays: sprays.filter(s => s.id !== id) });
  }

  // ---- Fertiliser actions ----
  function saveFert() {
    if (!feField.trim() || !feProduct.trim() || !feRate.trim()) return alert('Field, product, and rate are required');
    const rate = parseFloat(feRate);
    const area = parseFloat(feArea) || 0;
    const item: FertiliserRecord = {
      id: uid(),
      date: feDate, field: feField.trim(), crop: feCrop.trim(),
      product: feProduct.trim(), type: feType,
      n: parseFloat(feN) || 0, p: parseFloat(feP) || 0,
      k: parseFloat(feK) || 0, s: parseFloat(feS) || 0,
      ratePerHa: rate, area,
      totalApplied: Math.round(rate * area * 100) / 100,
      operator: feOperator.trim(), method: feMethod,
      soilTest: feSoil.trim(), notes: feNotes.trim()
    };
    addActivity(`Fertiliser record: ${feProduct} on ${feField}`);
    persist({ ...db, fertilisers: [...fertilisers, item] });
    resetFert();
    setFertModal(false);
  }

  function resetFert() {
    setFeDate(new Date().toISOString().slice(0, 10));
    setFeField(''); setFeCrop(''); setFeProduct(''); setFeType('Straight N');
    setFeN(''); setFeP(''); setFeK(''); setFeS('');
    setFeRate(''); setFeArea(''); setFeOperator(''); setFeMethod('Spreader');
    setFeSoil(''); setFeNotes('');
  }

  function deleteFert(id: string) {
    if (!confirm('Delete this fertiliser record?')) return;
    persist({ ...db, fertilisers: fertilisers.filter(f => f.id !== id) });
  }

  // ---- Certificate actions ----
  function saveCert() {
    if (!ceeName.trim()) return alert('Certificate name is required');
    const item: Certificate = {
      id: uid(),
      name: ceeName.trim(), holder: ceeHolder.trim(),
      certNumber: ceeCertNo.trim(), issueDate: ceeIssue,
      expiryDate: ceeExpiry, issuedBy: ceeIssuedBy.trim(),
      category: ceeCategory, notes: ceeNotes.trim()
    };
    addActivity(`Added certificate: ${ceeName}`);
    persist({ ...db, certificates: [...certificates, item] });
    resetCert();
    setCertModal(false);
  }

  function resetCert() {
    setCeeName(''); setCeeHolder(''); setCeeCertNo('');
    setCeeIssue(''); setCeeExpiry(''); setCeeIssuedBy('');
    setCeeCategory('Operator'); setCeeNotes('');
  }

  function deleteCert(id: string) {
    if (!confirm('Delete this certificate?')) return;
    persist({ ...db, certificates: certificates.filter(c => c.id !== id) });
  }

  // ---- Checklist actions ----
  function initChecklist(type: 'beef' | 'arable') {
    const template = type === 'beef' ? BEEF_CHECKLIST : ARABLE_CHECKLIST;
    const prefix = type === 'beef' ? 'beef_' : 'arable_';
    const existing = checklist.filter(c => !c.id.startsWith(prefix));
    const newItems: ChecklistItem[] = template.map(t => ({
      id: `${prefix}${uid()}`,
      section: t.section,
      item: t.item,
      status: 'No' as const,
      notes: '',
      lastChecked: ''
    }));
    persist({ ...db, checklist: [...existing, ...newItems] });
    addActivity(`Initialised ${type} inspection checklist`);
  }

  function updateChecklistItem(id: string, field: 'status' | 'notes', value: string) {
    const updated = checklist.map(c =>
      c.id === id
        ? { ...c, [field]: value, lastChecked: field === 'status' ? new Date().toISOString().slice(0, 10) : c.lastChecked }
        : c
    );
    persist({ ...db, checklist: updated });
  }

  function exportSprayCSV() {
    const headers = ['Date', 'Field', 'Crop', 'Product', 'Purpose', 'Batch', 'Dose', 'Unit', 'Area (ha)', 'Total Product', 'Water Vol (l/ha)', 'Operator', 'BASIS Ref', 'Wind', 'Temp', 'Harvest Interval', 'Notes'];
    const rows = sprays.map(s => [s.date, s.field, s.crop, s.product, s.purpose, s.batch, s.dose, s.doseUnit, s.area, s.totalProduct, s.waterVolume, s.operator, s.basisCertRef, s.windSpeed, s.temperature, s.harvestInterval, s.notes]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `spray-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportFertCSV() {
    const headers = ['Date', 'Field', 'Crop', 'Product', 'Type', 'N%', 'P%', 'K%', 'S%', 'Rate (kg/ha)', 'Area (ha)', 'Total Applied', 'Method', 'Operator', 'Soil Test', 'Notes'];
    const rows = fertilisers.map(f => [f.date, f.field, f.crop, f.product, f.type, f.n, f.p, f.k, f.s, f.ratePerHa, f.area, f.totalApplied, f.method, f.operator, f.soilTest, f.notes]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `fertiliser-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // Cert expiry helpers
  function certStatus(expiry: string): 'ok' | 'warn' | 'expired' | 'missing' {
    if (!expiry) return 'missing';
    const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'expired';
    if (days < 60) return 'warn';
    return 'ok';
  }

  const statusColor = { ok: 'bg-green', warn: 'bg-amber', expired: 'bg-red', missing: 'bg-amber' };
  const statusLabel = { ok: 'Valid', warn: 'Expiring soon', expired: 'Expired', missing: 'No expiry set' };

  // Overview metrics
  const beefItems = checklist.filter(c => c.id.startsWith('beef_'));
  const arableItems = checklist.filter(c => c.id.startsWith('arable_'));
  const beefYes = beefItems.filter(c => c.status === 'Yes' || c.status === 'N/A').length;
  const arableYes = arableItems.filter(c => c.status === 'Yes' || c.status === 'N/A').length;
  const beefPct = beefItems.length ? Math.round((beefYes / beefItems.length) * 100) : 0;
  const arablePct = arableItems.length ? Math.round((arableYes / arableItems.length) * 100) : 0;
  const expiredCerts = certificates.filter(c => certStatus(c.expiryDate) === 'expired').length;
  const warnCerts = certificates.filter(c => certStatus(c.expiryDate) === 'warn').length;

  const beefActions = beefItems.filter(c => c.status === 'No' || c.status === 'Action required').length;
  const arableActions = arableItems.filter(c => c.status === 'No' || c.status === 'Action required').length;

  const filteredSprays = sprayFilter ? sprays.filter(s => s.field.toLowerCase().includes(sprayFilter.toLowerCase()) || s.product.toLowerCase().includes(sprayFilter.toLowerCase())) : sprays;
  const filteredFerts = fertFilter ? fertilisers.filter(f => f.field.toLowerCase().includes(fertFilter.toLowerCase()) || f.product.toLowerCase().includes(fertFilter.toLowerCase())) : fertilisers;

  const checklistItems = checklistType === 'beef' ? beefItems : arableItems;
  const sections = Array.from(new Set(checklistItems.map(c => c.section)));

  return (
    <>
      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {(['overview', 'sprays', 'fertilisers', 'certificates', 'checklist'] as SubSection[]).map(s => (
          <button
            key={s}
            onClick={() => setSub(s)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: 'var(--radius)',
              border: sub === s ? '2px solid var(--green)' : '1px solid var(--border)',
              background: sub === s ? 'var(--green-pale)' : 'var(--bg-secondary)',
              color: sub === s ? 'var(--green)' : 'var(--text)',
              fontWeight: sub === s ? 700 : 400,
              cursor: 'pointer',
              fontSize: 13,
              textTransform: 'capitalize'
            }}
          >
            {s === 'overview' ? '📋 Overview' :
             s === 'sprays' ? '🌿 Sprays' :
             s === 'fertilisers' ? '🌱 Fertilisers' :
             s === 'certificates' ? '📜 Certificates' : '✅ Checklist'}
          </button>
        ))}
      </div>

      {/* ============ OVERVIEW ============ */}
      {sub === 'overview' && (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Beef readiness</div>
              <div className="metric-value" style={{ color: beefPct >= 80 ? 'var(--green)' : beefPct >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                {beefItems.length ? `${beefPct}%` : '—'}
              </div>
              <div className="metric-sub">{beefActions > 0 ? `${beefActions} actions needed` : beefItems.length ? 'Looking good' : 'Checklist not set up'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Arable readiness</div>
              <div className="metric-value" style={{ color: arablePct >= 80 ? 'var(--green)' : arablePct >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                {arableItems.length ? `${arablePct}%` : '—'}
              </div>
              <div className="metric-sub">{arableActions > 0 ? `${arableActions} actions needed` : arableItems.length ? 'Looking good' : 'Checklist not set up'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Spray records</div>
              <div className="metric-value">{sprays.length}</div>
              <div className="metric-sub">this season</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Certificates</div>
              <div className="metric-value" style={{ color: expiredCerts > 0 ? 'var(--red)' : warnCerts > 0 ? 'var(--amber)' : 'inherit' }}>
                {certificates.length}
              </div>
              <div className="metric-sub">{expiredCerts > 0 ? `${expiredCerts} expired` : warnCerts > 0 ? `${warnCerts} expiring soon` : 'All valid'}</div>
            </div>
          </div>

          {/* Readiness bars */}
          {(beefItems.length > 0 || arableItems.length > 0) && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-title">Inspection Readiness</div>
              {beefItems.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>Beef (SAI Global)</span>
                    <span style={{ fontWeight: 600 }}>{beefYes}/{beefItems.length}</span>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, height: 12, overflow: 'hidden' }}>
                    <div style={{ width: `${beefPct}%`, height: '100%', background: beefPct >= 80 ? 'var(--green)' : beefPct >= 50 ? 'var(--amber)' : 'var(--red)', transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
              {arableItems.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>Arable (SAI Global)</span>
                    <span style={{ fontWeight: 600 }}>{arableYes}/{arableItems.length}</span>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, height: 12, overflow: 'hidden' }}>
                    <div style={{ width: `${arablePct}%`, height: '100%', background: arablePct >= 80 ? 'var(--green)' : arablePct >= 50 ? 'var(--amber)' : 'var(--red)', transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Certificate warnings */}
          {(expiredCerts > 0 || warnCerts > 0) && (
            <div className="card" style={{ marginTop: '1rem', borderLeft: `3px solid ${expiredCerts > 0 ? 'var(--red)' : 'var(--amber)'}` }}>
              <div className="card-title">⚠️ Certificate Alerts</div>
              {certificates.filter(c => ['expired', 'warn'].includes(certStatus(c.expiryDate))).map(c => (
                <div key={c.id} className="row-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-name">{c.name}</div>
                    <div className="row-sub">{c.holder} · expires {fmtDate(c.expiryDate)}</div>
                  </div>
                  <span className={`badge ${statusColor[certStatus(c.expiryDate)]}`} style={{ fontSize: 10 }}>
                    {statusLabel[certStatus(c.expiryDate)]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Quick setup prompts */}
          {(beefItems.length === 0 || arableItems.length === 0) && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-title">Quick Setup</div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Load pre-built SAI Global inspection checklists to get started quickly.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {beefItems.length === 0 && (
                  <button className="btn-primary" onClick={() => initChecklist('beef')}>
                    Load beef checklist
                  </button>
                )}
                {arableItems.length === 0 && (
                  <button className="btn-primary" onClick={() => initChecklist('arable')}>
                    Load arable checklist
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ SPRAYS ============ */}
      {sub === 'sprays' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button className="btn-add" onClick={() => { resetSpray(); setSprayModal(true); }}>+ Add spray record</button>
            <button className="btn-primary" onClick={exportSprayCSV}>📥 Export CSV</button>
            <input
              type="text"
              placeholder="Filter by field or product…"
              value={sprayFilter}
              onChange={e => setSprayFilter(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flex: 1, minWidth: 150 }}
            />
          </div>

          <div className="card">
            <div className="card-title">Spray Application Records ({sprays.length})</div>
            {filteredSprays.length === 0
              ? <div className="empty">No spray records yet.</div>
              : filteredSprays.slice().reverse().map(s => (
                <div key={s.id} className="row-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-name">{s.product} — {s.field}</div>
                    <div className="row-sub">
                      {fmtDate(s.date)} · {s.purpose} · {s.dose}{s.doseUnit} · {s.area}ha
                      {s.operator ? ` · Op: ${s.operator}` : ''}
                      {s.basisCertRef ? ` · BASIS: ${s.basisCertRef}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span className="badge bg-blue" style={{ fontSize: 10 }}>{s.purpose}</span>
                    <button className="del-btn" onClick={() => deleteSpray(s.id)}>×</button>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* ============ FERTILISERS ============ */}
      {sub === 'fertilisers' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button className="btn-add" onClick={() => { resetFert(); setFertModal(true); }}>+ Add fertiliser record</button>
            <button className="btn-primary" onClick={exportFertCSV}>📥 Export CSV</button>
            <input
              type="text"
              placeholder="Filter by field or product…"
              value={fertFilter}
              onChange={e => setFertFilter(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flex: 1, minWidth: 150 }}
            />
          </div>

          <div className="card">
            <div className="card-title">Fertiliser Application Records ({fertilisers.length})</div>
            {filteredFerts.length === 0
              ? <div className="empty">No fertiliser records yet.</div>
              : filteredFerts.slice().reverse().map(f => (
                <div key={f.id} className="row-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-name">{f.product} — {f.field}</div>
                    <div className="row-sub">
                      {fmtDate(f.date)} · {f.type} · {f.ratePerHa}kg/ha · {f.area}ha · Total: {f.totalApplied}kg
                      {f.operator ? ` · Op: ${f.operator}` : ''}
                    </div>
                    {(f.n > 0 || f.p > 0 || f.k > 0) && (
                      <div className="row-sub">N:{f.n}% P:{f.p}% K:{f.k}%{f.s > 0 ? ` S:${f.s}%` : ''}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span className="badge bg-green" style={{ fontSize: 10 }}>{f.type}</span>
                    <button className="del-btn" onClick={() => deleteFert(f.id)}>×</button>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* ============ CERTIFICATES ============ */}
      {sub === 'certificates' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button className="btn-add" onClick={() => { resetCert(); setCertModal(true); }}>+ Add certificate</button>
            {certificates.length === 0 && (
              <button className="btn-primary" onClick={() => {
                const items: Certificate[] = DEFAULT_CERTS.map(dc => ({
                  id: uid(), name: dc.name, holder: dc.holder,
                  certNumber: '', issueDate: '', expiryDate: '',
                  issuedBy: '', category: dc.category, notes: ''
                }));
                persist({ ...db, certificates: items });
                addActivity('Loaded default certificate list');
              }}>Load defaults</button>
            )}
          </div>

          <div className="card">
            <div className="card-title">Certificates & Documents ({certificates.length})</div>
            {certificates.length === 0
              ? <div className="empty">No certificates yet. Add manually or load defaults.</div>
              : certificates.map(c => (
                <div key={c.id} className="row-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-name">{c.name}</div>
                    <div className="row-sub">
                      {c.holder ? `${c.holder} · ` : ''}{c.issuedBy ? `${c.issuedBy} · ` : ''}
                      {c.certNumber ? `Ref: ${c.certNumber} · ` : ''}
                      {c.expiryDate ? `Expires: ${fmtDate(c.expiryDate)}` : 'No expiry set'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span className={`badge ${statusColor[certStatus(c.expiryDate)]}`} style={{ fontSize: 10 }}>
                      {statusLabel[certStatus(c.expiryDate)]}
                    </span>
                    <span className="badge bg-blue" style={{ fontSize: 10 }}>{c.category}</span>
                    <button className="del-btn" onClick={() => deleteCert(c.id)}>×</button>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* ============ CHECKLIST ============ */}
      {sub === 'checklist' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={checklistType}
              onChange={e => setChecklistType(e.target.value as 'beef' | 'arable')}
              style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
            >
              <option value="beef">Beef inspection</option>
              <option value="arable">Arable inspection</option>
            </select>
            {checklistItems.length === 0 && (
              <button className="btn-primary" onClick={() => initChecklist(checklistType)}>
                Load {checklistType} checklist
              </button>
            )}
          </div>

          {checklistItems.length === 0 ? (
            <div className="card">
              <div className="empty">No {checklistType} checklist loaded yet. Click "Load {checklistType} checklist" above.</div>
            </div>
          ) : (
            sections.map(section => {
              const items = checklistItems.filter(c => c.section === section);
              const sectionYes = items.filter(c => c.status === 'Yes' || c.status === 'N/A').length;
              const sectionPct = Math.round((sectionYes / items.length) * 100);
              return (
                <div key={section} className="card" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div className="card-title" style={{ marginBottom: 0 }}>{section}</div>
                    <span className={`badge ${sectionPct === 100 ? 'bg-green' : sectionPct >= 50 ? 'bg-amber' : 'bg-red'}`} style={{ fontSize: 10 }}>
                      {sectionYes}/{items.length}
                    </span>
                  </div>
                  {items.map(item => (
                    <div key={item.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, fontSize: 13, paddingTop: 2 }}>{item.item}</div>
                        <select
                          value={item.status}
                          onChange={e => updateChecklistItem(item.id, 'status', e.target.value)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            fontSize: 12,
                            background: item.status === 'Yes' ? 'var(--green-pale)' : item.status === 'N/A' ? 'var(--bg-secondary)' : item.status === 'Action required' ? '#fef3c7' : '#fee2e2',
                            color: item.status === 'Yes' ? 'var(--green)' : item.status === 'Action required' ? '#92400e' : 'inherit'
                          }}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                          <option value="N/A">N/A</option>
                          <option value="Action required">Action required</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="Notes (optional)…"
                        value={item.notes}
                        onChange={e => updateChecklistItem(item.id, 'notes', e.target.value)}
                        style={{ marginTop: 4, width: '100%', padding: '0.25rem 0.5rem', fontSize: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                      />
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </>
      )}

      {/* ============ SPRAY MODAL ============ */}
      {sprayModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setSprayModal(false)}>
          <div className="modal-box" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">Add spray record</div>
            <div className="field-row">
              <label className="form-label">Date</label>
              <input type="date" value={spDate} onChange={e => setSpDate(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Field</label>
              <input type="text" value={spField} onChange={e => setSpField(e.target.value)} placeholder="Field name" />
            </div>
            <div className="field-row">
              <label className="form-label">Crop</label>
              <input type="text" value={spCrop} onChange={e => setSpCrop(e.target.value)} placeholder="e.g. Winter wheat" />
            </div>
            <div className="field-row">
              <label className="form-label">Product</label>
              <input type="text" value={spProduct} onChange={e => setSpProduct(e.target.value)} placeholder="Product name" />
            </div>
            <div className="field-row">
              <label className="form-label">Purpose</label>
              <select value={spPurpose} onChange={e => setSpPurpose(e.target.value)}>
                {SPRAY_PURPOSES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Batch / lot no.</label>
              <input type="text" value={spBatch} onChange={e => setSpBatch(e.target.value)} placeholder="Batch number" />
            </div>
            <div className="field-row">
              <label className="form-label">Dose</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" value={spDose} onChange={e => setSpDose(e.target.value)} placeholder="0.0" step="0.01" style={{ flex: 1 }} />
                <select value={spDoseUnit} onChange={e => setSpDoseUnit(e.target.value)}>
                  <option>l/ha</option>
                  <option>kg/ha</option>
                  <option>g/ha</option>
                  <option>ml/ha</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <label className="form-label">Area (ha)</label>
              <input type="number" value={spArea} onChange={e => setSpArea(e.target.value)} placeholder="0.0" step="0.1" />
            </div>
            <div className="field-row">
              <label className="form-label">Water volume (l/ha)</label>
              <input type="number" value={spWater} onChange={e => setSpWater(e.target.value)} placeholder="e.g. 200" />
            </div>
            <div className="field-row">
              <label className="form-label">Operator</label>
              <input type="text" value={spOperator} onChange={e => setSpOperator(e.target.value)} placeholder="Name" />
            </div>
            <div className="field-row">
              <label className="form-label">BASIS cert ref</label>
              <input type="text" value={spBasis} onChange={e => setSpBasis(e.target.value)} placeholder="Certificate number" />
            </div>
            <div className="field-row">
              <label className="form-label">Wind speed</label>
              <input type="text" value={spWind} onChange={e => setSpWind(e.target.value)} placeholder="e.g. 5 mph, light breeze" />
            </div>
            <div className="field-row">
              <label className="form-label">Temperature (°C)</label>
              <input type="text" value={spTemp} onChange={e => setSpTemp(e.target.value)} placeholder="e.g. 15°C" />
            </div>
            <div className="field-row">
              <label className="form-label">Harvest interval (days)</label>
              <input type="number" value={spHI} onChange={e => setSpHI(e.target.value)} placeholder="0" />
            </div>
            <div className="field-row">
              <label className="form-label">Re-entry interval (hours)</label>
              <input type="number" value={spREI} onChange={e => setSpREI(e.target.value)} placeholder="0" />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <input type="text" value={spNotes} onChange={e => setSpNotes(e.target.value)} placeholder="Any additional notes" />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={saveSpray}>Save record</button>
              <button className="btn-cancel" onClick={() => setSprayModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ FERTILISER MODAL ============ */}
      {fertModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setFertModal(false)}>
          <div className="modal-box" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">Add fertiliser record</div>
            <div className="field-row">
              <label className="form-label">Date</label>
              <input type="date" value={feDate} onChange={e => setFeDate(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Field</label>
              <input type="text" value={feField} onChange={e => setFeField(e.target.value)} placeholder="Field name" />
            </div>
            <div className="field-row">
              <label className="form-label">Crop</label>
              <input type="text" value={feCrop} onChange={e => setFeCrop(e.target.value)} placeholder="e.g. Winter wheat" />
            </div>
            <div className="field-row">
              <label className="form-label">Product</label>
              <input type="text" value={feProduct} onChange={e => setFeProduct(e.target.value)} placeholder="Product name" />
            </div>
            <div className="field-row">
              <label className="form-label">Type</label>
              <select value={feType} onChange={e => setFeType(e.target.value)}>
                {FERT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">N / P / K / S (%)</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" value={feN} onChange={e => setFeN(e.target.value)} placeholder="N" step="0.1" style={{ flex: 1 }} />
                <input type="number" value={feP} onChange={e => setFeP(e.target.value)} placeholder="P" step="0.1" style={{ flex: 1 }} />
                <input type="number" value={feK} onChange={e => setFeK(e.target.value)} placeholder="K" step="0.1" style={{ flex: 1 }} />
                <input type="number" value={feS} onChange={e => setFeS(e.target.value)} placeholder="S" step="0.1" style={{ flex: 1 }} />
              </div>
            </div>
            <div className="field-row">
              <label className="form-label">Rate (kg/ha)</label>
              <input type="number" value={feRate} onChange={e => setFeRate(e.target.value)} placeholder="0" step="1" />
            </div>
            <div className="field-row">
              <label className="form-label">Area (ha)</label>
              <input type="number" value={feArea} onChange={e => setFeArea(e.target.value)} placeholder="0.0" step="0.1" />
            </div>
            <div className="field-row">
              <label className="form-label">Application method</label>
              <select value={feMethod} onChange={e => setFeMethod(e.target.value)}>
                {APPLY_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Operator</label>
              <input type="text" value={feOperator} onChange={e => setFeOperator(e.target.value)} placeholder="Name" />
            </div>
            <div className="field-row">
              <label className="form-label">Soil test reference</label>
              <input type="text" value={feSoil} onChange={e => setFeSoil(e.target.value)} placeholder="Soil test date or ref" />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <input type="text" value={feNotes} onChange={e => setFeNotes(e.target.value)} placeholder="Any additional notes" />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={saveFert}>Save record</button>
              <button className="btn-cancel" onClick={() => setFertModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ CERTIFICATE MODAL ============ */}
      {certModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setCertModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Add certificate</div>
            <div className="field-row">
              <label className="form-label">Certificate name</label>
              <input type="text" value={ceeName} onChange={e => setCeeName(e.target.value)} placeholder="e.g. BASIS Certificate" />
            </div>
            <div className="field-row">
              <label className="form-label">Category</label>
              <select value={ceeCategory} onChange={e => setCeeCategory(e.target.value)}>
                {CERT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Holder (name)</label>
              <input type="text" value={ceeHolder} onChange={e => setCeeHolder(e.target.value)} placeholder="Who holds this cert" />
            </div>
            <div className="field-row">
              <label className="form-label">Certificate number</label>
              <input type="text" value={ceeCertNo} onChange={e => setCeeCertNo(e.target.value)} placeholder="Ref number" />
            </div>
            <div className="field-row">
              <label className="form-label">Issued by</label>
              <input type="text" value={ceeIssuedBy} onChange={e => setCeeIssuedBy(e.target.value)} placeholder="Issuing body" />
            </div>
            <div className="field-row">
              <label className="form-label">Issue date</label>
              <input type="date" value={ceeIssue} onChange={e => setCeeIssue(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Expiry date</label>
              <input type="date" value={ceeExpiry} onChange={e => setCeeExpiry(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <input type="text" value={ceeNotes} onChange={e => setCeeNotes(e.target.value)} placeholder="Any notes" />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={saveCert}>Save</button>
              <button className="btn-cancel" onClick={() => setCertModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
