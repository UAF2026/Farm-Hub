'use client';

import { useState, useMemo } from 'react';
import { FarmData, FarmBible as FarmBibleType, FarmOverview, FarmPerson, FarmEnterprise, FarmAgreement, FieldNote, FarmDecision } from '@/lib/types';
import { uid } from '@/lib/utils';

type BibleTab = 'overview' | 'people' | 'enterprises' | 'agreements' | 'fields' | 'decisions';

const BIBLE_TABS: { id: BibleTab; label: string; icon: string }[] = [
  { id: 'overview',     label: 'The Farm',    icon: '🏡' },
  { id: 'people',       label: 'People',      icon: '👥' },
  { id: 'enterprises',  label: 'Enterprises', icon: '📊' },
  { id: 'agreements',   label: 'Agreements',  icon: '📋' },
  { id: 'fields',       label: 'Field Notes', icon: '🌾' },
  { id: 'decisions',    label: 'Decisions',   icon: '📖' },
];

const EMPTY_BIBLE: FarmBibleType = {
  people: [],
  enterprises: [],
  agreements: [],
  fieldNotes: [],
  decisions: [],
};

function emptyOverview(): FarmOverview {
  return {
    history: '',
    totalAreaHa: 0,
    ownedAreaHa: 0,
    tenantedAreaHa: 0,
    enterprises: '',
    farmType: '',
    sbi: '106227532',
    vatRegistered: true,
    vatNumber: '',
    notes: '',
  };
}

/* ─── Textarea auto-grow helper ─────────────────────────────────────────── */
function Textarea({ value, onChange, rows = 3, placeholder = '' }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
    />
  );
}

/* ─── Overview chapter ───────────────────────────────────────────────────── */
function OverviewChapter({ bible, onSave }: { bible: FarmBibleType; onSave: (b: FarmBibleType) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FarmOverview>(bible.overview ?? emptyOverview());
  const f = (k: keyof FarmOverview) => (v: string | number | boolean) =>
    setForm(p => ({ ...p, [k]: v }));

  const save = () => {
    onSave({ ...bible, overview: form, lastUpdated: new Date().toISOString() });
    setEditing(false);
  };

  const ov = bible.overview;

  if (!editing) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>The Farm</div>
          <button className="btn-secondary" onClick={() => { setForm(ov ?? emptyOverview()); setEditing(true); }}>
            {ov ? 'Edit' : '+ Fill in farm details'}
          </button>
        </div>
        {!ov ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No farm overview yet. Click to add key facts about Upper Assendon Farm — this feeds into the daily briefing and decision tools.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {ov.history && (
              <div className="card">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>History & Background</div>
                <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{ov.history}</p>
              </div>
            )}
            <div className="card">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {[
                  ['Farm Type', ov.farmType],
                  ['Total Area', ov.totalAreaHa ? `${ov.totalAreaHa} ha` : '—'],
                  ['Owned', ov.ownedAreaHa ? `${ov.ownedAreaHa} ha` : '—'],
                  ['Tenanted', ov.tenantedAreaHa ? `${ov.tenantedAreaHa} ha` : '—'],
                  ['SBI', ov.sbi],
                  ['VAT', ov.vatRegistered ? `Registered${ov.vatNumber ? ` (${ov.vatNumber})` : ''}` : 'Not registered'],
                  ['Enterprises', ov.enterprises],
                ].map(([label, val]) => val ? (
                  <div key={label as string}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ fontSize: 14, marginTop: 2 }}>{val}</div>
                  </div>
                ) : null)}
              </div>
            </div>
            {ov.notes && (
              <div className="card">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
                <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{ov.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="card-title" style={{ margin: 0 }}>Edit Farm Overview</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
      <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <label className="form-label">Farm history & background</label>
          <Textarea value={form.history} onChange={f('history')} rows={5} placeholder="Fourth generation family farm, established 1890s..." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label className="form-label">Farm type</label>
            <input value={form.farmType} onChange={e => f('farmType')(e.target.value)} placeholder="Mixed arable and beef" />
          </div>
          <div>
            <label className="form-label">Enterprises (comma-separated)</label>
            <input value={form.enterprises} onChange={e => f('enterprises')(e.target.value)} placeholder="Arable, Wagyu, Breeding cattle" />
          </div>
          <div>
            <label className="form-label">Total area (ha)</label>
            <input type="number" value={form.totalAreaHa || ''} onChange={e => f('totalAreaHa')(+e.target.value)} />
          </div>
          <div>
            <label className="form-label">Owned (ha)</label>
            <input type="number" value={form.ownedAreaHa || ''} onChange={e => f('ownedAreaHa')(+e.target.value)} />
          </div>
          <div>
            <label className="form-label">Tenanted (ha)</label>
            <input type="number" value={form.tenantedAreaHa || ''} onChange={e => f('tenantedAreaHa')(+e.target.value)} />
          </div>
          <div>
            <label className="form-label">SBI number</label>
            <input value={form.sbi} onChange={e => f('sbi')(e.target.value)} />
          </div>
          <div>
            <label className="form-label">VAT number (if registered)</label>
            <input value={form.vatNumber} onChange={e => f('vatNumber')(e.target.value)} placeholder="GB 123 4567 89" />
          </div>
        </div>
        <div>
          <label className="form-label">Other notes</label>
          <Textarea value={form.notes} onChange={f('notes')} rows={3} placeholder="Anything else important about the farm..." />
        </div>
      </div>
    </div>
  );
}

/* ─── People chapter ─────────────────────────────────────────────────────── */
function PeopleChapter({ bible, onSave }: { bible: FarmBibleType; onSave: (b: FarmBibleType) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = (): FarmPerson => ({ id: uid(), name: '', role: '', company: '', phone: '', email: '', notes: '' });
  const [form, setForm] = useState<FarmPerson>(emptyForm());
  const f = (k: keyof FarmPerson) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = () => { setForm(emptyForm()); setEditingId('new'); };
  const openEdit = (p: FarmPerson) => { setForm({ ...p }); setEditingId(p.id); };
  const cancel = () => setEditingId(null);

  const save = () => {
    const people = editingId === 'new'
      ? [...bible.people, form]
      : bible.people.map(p => p.id === editingId ? form : p);
    onSave({ ...bible, people, lastUpdated: new Date().toISOString() });
    setEditingId(null);
  };

  const remove = (id: string) => {
    if (!confirm('Remove this person?')) return;
    onSave({ ...bible, people: bible.people.filter(p => p.id !== id), lastUpdated: new Date().toISOString() });
  };

  const ROLE_COLOURS: Record<string, string> = {
    'Farm Manager': '#2d6a4f', 'Agronomist': '#52796f', 'Accountant': '#3d405b',
    'Vet': '#c77dff', 'Bank': '#0096c7', 'Solicitor': '#7b2d8b', 'Agent': '#d4a017',
    'Merchant': '#b5451b', 'Contractor': '#555', 'Family': '#2d6a4f',
  };
  const roleColour = (role: string) => ROLE_COLOURS[role] || '#666';

  if (editingId !== null) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>{editingId === 'new' ? 'Add person' : 'Edit person'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">Name *</label>
              <input value={form.name} onChange={e => f('name')(e.target.value)} placeholder="Harry Smith" />
            </div>
            <div>
              <label className="form-label">Role *</label>
              <input value={form.role} onChange={e => f('role')(e.target.value)} placeholder="Farm Manager / Agronomist / Vet..." list="role-list" />
              <datalist id="role-list">
                {['Farm Manager','Agronomist','Accountant','Solicitor','Vet','Bank','Agent','Grain merchant','Contractor','Family','Other'].map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div>
              <label className="form-label">Company / Organisation</label>
              <input value={form.company ?? ''} onChange={e => f('company')(e.target.value)} placeholder="Gatekeeper, HSBC, Savills..." />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input value={form.phone ?? ''} onChange={e => f('phone')(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input type="email" value={form.email ?? ''} onChange={e => f('email')(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Notes — what they do, when to call them, anything important</label>
            <Textarea value={form.notes} onChange={f('notes')} rows={4} placeholder="Harry has been here 12 years, knows every field. Call him first for anything operational. Key contact for all AHDB work..." />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="card-title" style={{ margin: 0 }}>Key People ({bible.people.length})</div>
        <button className="btn-primary" onClick={openAdd}>+ Add person</button>
      </div>
      {bible.people.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No people recorded yet. Add Harry, Luke Cotton, your accountant, vet, bank contact — anyone important to the farm.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {bible.people.map(p => (
            <div key={p.id} className="card" style={{ borderLeft: `4px solid ${roleColour(p.role)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    {p.role}{p.company ? ` · ${p.company}` : ''}
                  </div>
                  {(p.phone || p.email) && (
                    <div style={{ fontSize: 13, marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {p.phone && <span>📞 {p.phone}</span>}
                      {p.email && <span>✉️ {p.email}</span>}
                    </div>
                  )}
                  {p.notes && <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{p.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(p)}>Edit</button>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(p.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Enterprises chapter ────────────────────────────────────────────────── */
function EnterprisesChapter({ bible, onSave }: { bible: FarmBibleType; onSave: (b: FarmBibleType) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = (): FarmEnterprise => ({
    id: uid(), name: '', type: 'Arable', targetMargin: 0, targetMarginUnit: 'per_ha',
    fixedCostPerHa: 0, variableCostPerHa: 0, averageYield: 0, yieldUnit: 't/ha', averagePrice: 0, notes: '',
  });
  const [form, setForm] = useState<FarmEnterprise>(emptyForm());
  const f = (k: keyof FarmEnterprise) => (v: string | number) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = () => { setForm(emptyForm()); setEditingId('new'); };
  const openEdit = (e: FarmEnterprise) => { setForm({ ...e }); setEditingId(e.id); };
  const cancel = () => setEditingId(null);
  const save = () => {
    const enterprises = editingId === 'new'
      ? [...bible.enterprises, form]
      : bible.enterprises.map(e => e.id === editingId ? form : e);
    onSave({ ...bible, enterprises, lastUpdated: new Date().toISOString() });
    setEditingId(null);
  };
  const remove = (id: string) => {
    if (!confirm('Remove this enterprise?')) return;
    onSave({ ...bible, enterprises: bible.enterprises.filter(e => e.id !== id), lastUpdated: new Date().toISOString() });
  };

  const TYPE_COLOURS: Record<string, string> = {
    'Arable': '#2d6a4f', 'Livestock': '#b5451b', 'Diversification': '#0096c7', 'Environmental': '#52796f'
  };

  if (editingId !== null) {
    const totalCost = (form.fixedCostPerHa || 0) + (form.variableCostPerHa || 0);
    const grossMargin = form.averageYield && form.averagePrice
      ? (form.averageYield * form.averagePrice) - (form.variableCostPerHa || 0)
      : null;

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>{editingId === 'new' ? 'Add enterprise' : 'Edit enterprise'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">Enterprise name *</label>
              <input value={form.name} onChange={e => f('name')(e.target.value)} placeholder="Winter wheat / Wagyu beef / SFI..." />
            </div>
            <div>
              <label className="form-label">Type</label>
              <select value={form.type} onChange={e => f('type')(e.target.value)}>
                {['Arable','Livestock','Diversification','Environmental'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Average yield</label>
              <input type="number" step="0.1" value={form.averageYield || ''} onChange={e => f('averageYield')(+e.target.value)} />
            </div>
            <div>
              <label className="form-label">Yield unit</label>
              <input value={form.yieldUnit ?? ''} onChange={e => f('yieldUnit')(e.target.value)} placeholder="t/ha / head/yr / £/ha" list="yield-unit-list" />
              <datalist id="yield-unit-list">
                {['t/ha','kg/head','head/yr','£/ha','£/yr'].map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div>
              <label className="form-label">Average price (£/unit)</label>
              <input type="number" step="0.01" value={form.averagePrice || ''} onChange={e => f('averagePrice')(+e.target.value)} />
            </div>
            <div>
              <label className="form-label">Variable costs (£/ha or £/head)</label>
              <input type="number" step="1" value={form.variableCostPerHa || ''} onChange={e => f('variableCostPerHa')(+e.target.value)} placeholder="seed, fert, spray, contract" />
            </div>
            <div>
              <label className="form-label">Fixed cost allocation (£/ha)</label>
              <input type="number" step="1" value={form.fixedCostPerHa || ''} onChange={e => f('fixedCostPerHa')(+e.target.value)} placeholder="machinery, labour, overhead" />
            </div>
            <div>
              <label className="form-label">Target margin (£)</label>
              <input type="number" step="1" value={form.targetMargin || ''} onChange={e => f('targetMargin')(+e.target.value)} />
            </div>
          </div>
          {(grossMargin !== null || totalCost > 0) && (
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
              {grossMargin !== null && <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross margin</div><div style={{ fontWeight: 700, fontSize: 15, color: grossMargin > 0 ? 'var(--green)' : 'var(--red)' }}>£{grossMargin.toFixed(0)}</div></div>}
              {totalCost > 0 && <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total cost</div><div style={{ fontWeight: 700, fontSize: 15 }}>£{totalCost.toFixed(0)}</div></div>}
            </div>
          )}
          <div>
            <label className="form-label">Notes — key things to know about this enterprise</label>
            <Textarea value={form.notes} onChange={v => f('notes')(v)} rows={4} placeholder="Key risks, opportunities, benchmarks, targets..." />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="card-title" style={{ margin: 0 }}>Enterprises ({bible.enterprises.length})</div>
        <button className="btn-primary" onClick={openAdd}>+ Add enterprise</button>
      </div>
      {bible.enterprises.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No enterprises recorded yet. Add your main activities — winter wheat, spring barley, Wagyu, breeding cattle, SFI — with their economics. This is the foundation of cost-of-production analysis.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {bible.enterprises.map(e => {
            const grossMargin = e.averageYield && e.averagePrice
              ? (e.averageYield * e.averagePrice) - (e.variableCostPerHa || 0)
              : null;
            const netMargin = grossMargin !== null
              ? grossMargin - (e.fixedCostPerHa || 0)
              : null;
            return (
              <div key={e.id} className="card" style={{ borderLeft: `4px solid ${TYPE_COLOURS[e.type] || '#666'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{e.name}</span>
                      <span style={{ fontSize: 11, background: TYPE_COLOURS[e.type] || '#666', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>{e.type}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {e.averageYield ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg yield</div><div style={{ fontSize: 13, fontWeight: 600 }}>{e.averageYield} {e.yieldUnit}</div></div> : null}
                      {e.averagePrice ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg price</div><div style={{ fontSize: 13, fontWeight: 600 }}>£{e.averagePrice}</div></div> : null}
                      {e.variableCostPerHa ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Variable cost</div><div style={{ fontSize: 13, fontWeight: 600 }}>£{e.variableCostPerHa}</div></div> : null}
                      {e.fixedCostPerHa ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fixed cost</div><div style={{ fontSize: 13, fontWeight: 600 }}>£{e.fixedCostPerHa}</div></div> : null}
                      {grossMargin !== null ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross margin</div><div style={{ fontSize: 13, fontWeight: 700, color: grossMargin > 0 ? 'var(--green)' : 'var(--red)' }}>£{grossMargin.toFixed(0)}</div></div> : null}
                      {netMargin !== null ? <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net margin</div><div style={{ fontSize: 13, fontWeight: 700, color: netMargin > 0 ? 'var(--green)' : 'var(--red)' }}>£{netMargin.toFixed(0)}</div></div> : null}
                    </div>
                    {e.notes && <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{e.notes}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(e)}>Edit</button>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(e.id)}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Agreements chapter ─────────────────────────────────────────────────── */
function AgreementsChapter({ bible, onSave }: { bible: FarmBibleType; onSave: (b: FarmBibleType) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = (): FarmAgreement => ({
    id: uid(), name: '', type: 'Scheme', counterparty: '', reference: '', startDate: '', endDate: '',
    annualValue: 0, keyObligations: '', keyRisks: '', contactName: '', contactEmail: '', contactPhone: '', notes: '',
  });
  const [form, setForm] = useState<FarmAgreement>(emptyForm());
  const f = (k: keyof FarmAgreement) => (v: string | number) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = () => { setForm(emptyForm()); setEditingId('new'); };
  const openEdit = (a: FarmAgreement) => { setForm({ ...a }); setEditingId(a.id); };
  const cancel = () => setEditingId(null);
  const save = () => {
    const agreements = editingId === 'new'
      ? [...bible.agreements, form]
      : bible.agreements.map(a => a.id === editingId ? form : a);
    onSave({ ...bible, agreements, lastUpdated: new Date().toISOString() });
    setEditingId(null);
  };
  const remove = (id: string) => {
    if (!confirm('Remove this agreement?')) return;
    onSave({ ...bible, agreements: bible.agreements.filter(a => a.id !== id), lastUpdated: new Date().toISOString() });
  };

  const urgency = (endDate?: string) => {
    if (!endDate) return 'none';
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'expired';
    if (days < 180) return 'urgent';
    if (days < 365) return 'warn';
    return 'ok';
  };

  const urgencyStyle = (u: string): React.CSSProperties => ({
    borderLeft: `4px solid ${u === 'expired' ? 'var(--red)' : u === 'urgent' ? '#e85d04' : u === 'warn' ? '#f4a261' : 'var(--green)'}`,
  });

  if (editingId !== null) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>{editingId === 'new' ? 'Add agreement' : 'Edit agreement'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Agreement name *</label>
              <input value={form.name} onChange={e => f('name')(e.target.value)} placeholder="CS Higher Tier 1255553 / Kepak Wagyu contract..." />
            </div>
            <div>
              <label className="form-label">Type</label>
              <select value={form.type} onChange={e => f('type')(e.target.value)}>
                {['Scheme','Sales contract','Tenancy','Supply','Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Counterparty</label>
              <input value={form.counterparty} onChange={e => f('counterparty')(e.target.value)} placeholder="RPA / Natural England / Kepak..." />
            </div>
            <div>
              <label className="form-label">Reference / agreement number</label>
              <input value={form.reference ?? ''} onChange={e => f('reference')(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Annual value (£, negative = cost)</label>
              <input type="number" step="1" value={form.annualValue || ''} onChange={e => f('annualValue')(+e.target.value)} />
            </div>
            <div>
              <label className="form-label">Start date</label>
              <input type="date" value={form.startDate ?? ''} onChange={e => f('startDate')(e.target.value)} />
            </div>
            <div>
              <label className="form-label">End date</label>
              <input type="date" value={form.endDate ?? ''} onChange={e => f('endDate')(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Key contact name</label>
              <input value={form.contactName ?? ''} onChange={e => f('contactName')(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Contact email</label>
              <input type="email" value={form.contactEmail ?? ''} onChange={e => f('contactEmail')(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Contact phone</label>
              <input value={form.contactPhone ?? ''} onChange={e => f('contactPhone')(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Key obligations — what must be done / restrictions</label>
            <Textarea value={form.keyObligations} onChange={v => f('keyObligations')(v)} rows={3} placeholder="11 management options, 37 parcels, no cultivation in buffer zones..." />
          </div>
          <div>
            <label className="form-label">Key risks — what happens if breached or not renewed</label>
            <Textarea value={form.keyRisks} onChange={v => f('keyRisks')(v)} rows={3} placeholder="Loss of £44,734/yr, 25% penalty window closes Sep 2026..." />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <Textarea value={form.notes} onChange={v => f('notes')(v)} rows={3} />
          </div>
        </div>
      </div>
    );
  }

  const sorted = [...bible.agreements].sort((a, b) => {
    const order = { expired: 0, urgent: 1, warn: 2, ok: 3, none: 4 };
    return order[urgency(a.endDate)] - order[urgency(b.endDate)];
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="card-title" style={{ margin: 0 }}>Agreements & Contracts ({bible.agreements.length})</div>
        <button className="btn-primary" onClick={openAdd}>+ Add agreement</button>
      </div>
      {bible.agreements.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No agreements recorded yet. Add CS, SFI, Kepak, Wildfarmed, Bix Hall tenancy — any contract with obligations or expiry dates. Agreements expiring within 12 months will show red.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {sorted.map(a => {
            const u = urgency(a.endDate);
            const daysLeft = a.endDate ? Math.ceil((new Date(a.endDate).getTime() - Date.now()) / 86400000) : null;
            return (
              <div key={a.id} className="card" style={urgencyStyle(u)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>
                      <span style={{ fontSize: 11, background: '#eee', borderRadius: 4, padding: '1px 6px', color: '#555' }}>{a.type}</span>
                      {u === 'expired' && <span style={{ fontSize: 11, background: 'var(--red)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>EXPIRED</span>}
                      {u === 'urgent' && <span style={{ fontSize: 11, background: '#e85d04', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>Expires {daysLeft}d</span>}
                      {u === 'warn' && <span style={{ fontSize: 11, background: '#f4a261', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>Expires {daysLeft}d</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.4rem', marginTop: '0.6rem' }}>
                      {a.counterparty && <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Counterparty </span><span style={{ fontSize: 13 }}>{a.counterparty}</span></div>}
                      {a.reference && <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ref </span><span style={{ fontSize: 13 }}>{a.reference}</span></div>}
                      {a.endDate && <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ends </span><span style={{ fontSize: 13 }}>{new Date(a.endDate).toLocaleDateString('en-GB')}</span></div>}
                      {a.annualValue !== undefined && a.annualValue !== 0 && (
                        <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Annual value </span><span style={{ fontSize: 13, fontWeight: 700, color: (a.annualValue || 0) > 0 ? 'var(--green)' : 'var(--red)' }}>£{Math.abs(a.annualValue || 0).toLocaleString()}</span></div>
                      )}
                    </div>
                    {a.keyObligations && <p style={{ fontSize: 13, marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 0 }}><strong>Obligations:</strong> {a.keyObligations}</p>}
                    {a.keyRisks && <p style={{ fontSize: 13, marginTop: 4, color: 'var(--red)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 0 }}><strong>Risks:</strong> {a.keyRisks}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(a)}>Edit</button>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(a.id)}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Field Notes chapter ────────────────────────────────────────────────── */
function FieldNotesChapter({ bible, db, onSave }: { bible: FarmBibleType; db: FarmData; onSave: (b: FarmBibleType) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const emptyForm = (): FieldNote => ({
    id: uid(), fieldName: '', soilType: '', drainage: 'Average',
    knownIssues: '', historicalYield: '', bestCrops: '', avoidCrops: '', accessNotes: '', csOptions: '', notes: '',
  });
  const [form, setForm] = useState<FieldNote>(emptyForm());
  const f = (k: keyof FieldNote) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = (fieldName = '') => { setForm({ ...emptyForm(), fieldName }); setEditingId('new'); };
  const openEdit = (fn: FieldNote) => { setForm({ ...fn }); setEditingId(fn.id); };
  const cancel = () => setEditingId(null);
  const save = () => {
    const fieldNotes = editingId === 'new'
      ? [...bible.fieldNotes, form]
      : bible.fieldNotes.map(fn => fn.id === editingId ? form : fn);
    onSave({ ...bible, fieldNotes, lastUpdated: new Date().toISOString() });
    setEditingId(null);
  };
  const remove = (id: string) => {
    if (!confirm('Remove this field note?')) return;
    onSave({ ...bible, fieldNotes: bible.fieldNotes.filter(fn => fn.id !== id), lastUpdated: new Date().toISOString() });
  };

  const fieldNames = useMemo(() => db.fields.map(f => f.name).filter(Boolean).sort(), [db.fields]);
  const noted = new Set(bible.fieldNotes.map(fn => fn.fieldName));
  const unnoted = fieldNames.filter(n => !noted.has(n));

  const DRAINAGE_COLOUR: Record<string, string> = { 'Good': '#2d6a4f', 'Average': '#f4a261', 'Poor': '#e85d04', 'Very poor': '#e63946' };

  const filtered = bible.fieldNotes.filter(fn =>
    !search || fn.fieldName.toLowerCase().includes(search.toLowerCase())
  );

  if (editingId !== null) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>{editingId === 'new' ? 'Add field note' : 'Edit field note'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">Field name *</label>
              <input value={form.fieldName} onChange={e => f('fieldName')(e.target.value)} list="field-name-list" placeholder="Start typing field name..." />
              <datalist id="field-name-list">
                {fieldNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label className="form-label">Soil type</label>
              <input value={form.soilType} onChange={e => f('soilType')(e.target.value)} placeholder="Chalk over clay / Brashy chalk / Heavy clay..." list="soil-list" />
              <datalist id="soil-list">
                {['Chalk','Brashy chalk','Chalk over clay','Heavy clay','Clay loam','Sandy loam','Light sand','Flint'].map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="form-label">Drainage</label>
              <select value={form.drainage} onChange={e => f('drainage')(e.target.value)}>
                {['Good','Average','Poor','Very poor'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Historical yield</label>
              <input value={form.historicalYield} onChange={e => f('historicalYield')(e.target.value)} placeholder="Wheat 8.5–9.5 t/ha, barley 7 t/ha" />
            </div>
          </div>
          <div>
            <label className="form-label">Known issues — wet corners, compaction, pylons, watercourse, access problems</label>
            <Textarea value={form.knownIssues} onChange={f('knownIssues')} rows={3} placeholder="Wet corner in SW, compaction on headland from turning..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">Best crops for this field</label>
              <Textarea value={form.bestCrops} onChange={f('bestCrops')} rows={2} placeholder="Wheat performs well, good OSR years..." />
            </div>
            <div>
              <label className="form-label">Crops to avoid and why</label>
              <Textarea value={form.avoidCrops} onChange={f('avoidCrops')} rows={2} placeholder="Beans — poor establishment in clay, 2019 loss..." />
            </div>
          </div>
          <div>
            <label className="form-label">CS / SFI options on this field</label>
            <input value={form.csOptions ?? ''} onChange={e => f('csOptions')(e.target.value)} placeholder="AB8 (beetle bank), GS4 (herbal ley)..." />
          </div>
          <div>
            <label className="form-label">Access / machinery notes</label>
            <input value={form.accessNotes} onChange={e => f('accessNotes')(e.target.value)} placeholder="Gate too narrow for 8m drill — use Barn Lane entrance..." />
          </div>
          <div>
            <label className="form-label">Other notes</label>
            <Textarea value={form.notes} onChange={f('notes')} rows={3} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="card-title" style={{ margin: 0 }}>Field Notes ({bible.fieldNotes.length} of {fieldNames.length} fields)</div>
        <button className="btn-primary" onClick={() => openAdd()}>+ Add field note</button>
      </div>

      {unnoted.length > 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#a67c00', marginBottom: 6 }}>{unnoted.length} fields with no notes yet — click to add</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unnoted.slice(0, 20).map(n => (
              <button key={n} onClick={() => openAdd(n)} style={{ fontSize: 12, padding: '2px 8px', background: '#fff', border: '1px solid #ffe082', borderRadius: 12, cursor: 'pointer', color: '#a67c00' }}>{n}</button>
            ))}
            {unnoted.length > 20 && <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 4px' }}>+{unnoted.length - 20} more</span>}
          </div>
        </div>
      )}

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search fields..."
        style={{ marginBottom: '0.75rem' }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No field notes yet. Build up field-by-field knowledge — soil type, drainage, historical yields, known issues. This is the kind of information that only exists in your head right now.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {filtered.map(fn => (
            <div key={fn.id} className="card" style={{ borderLeft: `4px solid ${DRAINAGE_COLOUR[fn.drainage] || '#ccc'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{fn.fieldName}</span>
                    {fn.soilType && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fn.soilType}</span>}
                    <span style={{ fontSize: 11, background: DRAINAGE_COLOUR[fn.drainage], color: '#fff', borderRadius: 4, padding: '1px 6px' }}>{fn.drainage} drainage</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.4rem' }}>
                    {fn.historicalYield && <div><span style={{ color: 'var(--text-muted)' }}>Yield: </span>{fn.historicalYield}</div>}
                    {fn.bestCrops && <div><span style={{ color: 'var(--text-muted)' }}>Best: </span>{fn.bestCrops}</div>}
                    {fn.avoidCrops && <div><span style={{ color: 'var(--red)' }}>Avoid: </span>{fn.avoidCrops}</div>}
                    {fn.csOptions && <div><span style={{ color: 'var(--text-muted)' }}>CS/SFI: </span>{fn.csOptions}</div>}
                  </div>
                  {fn.knownIssues && <p style={{ fontSize: 13, marginTop: 6, color: '#a67c00', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 0 }}>⚠️ {fn.knownIssues}</p>}
                  {fn.accessNotes && <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 0 }}>🚜 {fn.accessNotes}</p>}
                  {fn.notes && <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{fn.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(fn)}>Edit</button>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(fn.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Decisions chapter ──────────────────────────────────────────────────── */
function DecisionsChapter({ bible, onSave }: { bible: FarmBibleType; onSave: (b: FarmBibleType) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('All');
  const emptyForm = (): FarmDecision => ({
    id: uid(), date: new Date().toISOString().slice(0, 10), season: '', category: 'Cropping',
    title: '', decision: '', rationale: '', outcome: '', tags: [],
  });
  const [form, setForm] = useState<FarmDecision>(emptyForm());
  const f = (k: keyof FarmDecision) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = () => { setForm(emptyForm()); setEditingId('new'); };
  const openEdit = (d: FarmDecision) => { setForm({ ...d, tags: d.tags ?? [] }); setEditingId(d.id); };
  const cancel = () => setEditingId(null);
  const save = () => {
    const decisions = editingId === 'new'
      ? [...bible.decisions, form]
      : bible.decisions.map(d => d.id === editingId ? form : d);
    onSave({ ...bible, decisions, lastUpdated: new Date().toISOString() });
    setEditingId(null);
  };
  const remove = (id: string) => {
    if (!confirm('Remove this decision?')) return;
    onSave({ ...bible, decisions: bible.decisions.filter(d => d.id !== id), lastUpdated: new Date().toISOString() });
  };

  const CATEGORIES = ['Cropping','Livestock','Financial','Capital','Land','Scheme','Other'];
  const CAT_COLOURS: Record<string, string> = {
    'Cropping': '#2d6a4f', 'Livestock': '#b5451b', 'Financial': '#0096c7',
    'Capital': '#3d405b', 'Land': '#52796f', 'Scheme': '#d4a017', 'Other': '#888',
  };

  const sorted = [...bible.decisions].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = filterCat === 'All' ? sorted : sorted.filter(d => d.category === filterCat);

  if (editingId !== null) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>{editingId === 'new' ? 'Record a decision' : 'Edit decision'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={cancel}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">Date *</label>
              <input type="date" value={form.date} onChange={e => f('date')(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Season</label>
              <input value={form.season ?? ''} onChange={e => f('season')(e.target.value)} placeholder="2025/26" />
            </div>
            <div>
              <label className="form-label">Category</label>
              <select value={form.category} onChange={e => f('category')(e.target.value as FarmDecision['category'])}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Title — one-line summary *</label>
            <input value={form.title} onChange={e => f('title')(e.target.value)} placeholder="Switched Nailboss from winter wheat to spring barley" />
          </div>
          <div>
            <label className="form-label">Decision — what was decided</label>
            <Textarea value={form.decision} onChange={f('decision')} rows={2} placeholder="Drilled spring barley in Nailboss instead of winter wheat..." />
          </div>
          <div>
            <label className="form-label">Rationale — WHY (this is the most important field)</label>
            <Textarea value={form.rationale} onChange={f('rationale')} rows={4} placeholder="Field was too wet in October to drill. Previous wheat crop had brome problem. Spring barley gives cleaner rotation and avoids expensive fungicide programme..." />
          </div>
          <div>
            <label className="form-label">Outcome (fill in later)</label>
            <Textarea value={form.outcome ?? ''} onChange={f('outcome')} rows={2} placeholder="Leave blank — fill in once you know the result..." />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="card-title" style={{ margin: 0 }}>Decisions Log ({bible.decisions.length})</div>
        <button className="btn-primary" onClick={openAdd}>+ Record decision</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {['All', ...CATEGORIES].map(c => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
              background: filterCat === c ? (CAT_COLOURS[c] || 'var(--green)') : '#eee',
              color: filterCat === c ? '#fff' : 'var(--text-muted)',
              border: 'none', fontFamily: 'inherit',
            }}
          >{c}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {bible.decisions.length === 0
            ? 'No decisions recorded yet. Every time you make a significant decision — what to plant, whether to forward sell, a capital purchase — record it here with the rationale. In 5 years this is worth its weight in gold.'
            : 'No decisions in this category.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {filtered.map(d => (
            <div key={d.id} className="card" style={{ borderLeft: `4px solid ${CAT_COLOURS[d.category] || '#888'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</span>
                    <span style={{ fontSize: 11, background: CAT_COLOURS[d.category] || '#888', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>{d.category}</span>
                    {d.season && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.season}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  {d.decision && <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{d.decision}</p>}
                  {d.rationale && <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 0, fontStyle: 'italic' }}>Why: {d.rationale}</p>}
                  {d.outcome && <p style={{ fontSize: 13, marginTop: 4, color: 'var(--green)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 0 }}>Outcome: {d.outcome}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(d)}>Edit</button>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(d.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main FarmBible component ───────────────────────────────────────────── */
export default function FarmBible({ db, persist }: { db: FarmData; persist: (d: FarmData) => void }) {
  const [activeTab, setActiveTab] = useState<BibleTab>('overview');

  const bible: FarmBibleType = db.farmBible ?? EMPTY_BIBLE;

  const onSave = (updated: FarmBibleType) => {
    persist({ ...db, farmBible: updated });
  };

  // Summary stats for header
  const expiringSoon = bible.agreements.filter(a => {
    if (!a.endDate) return false;
    const days = Math.ceil((new Date(a.endDate).getTime() - Date.now()) / 86400000);
    return days >= 0 && days < 365;
  }).length;

  return (
    <div className="section">
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: 20, fontFamily: 'Lora, serif', color: 'var(--green)', margin: '0 0 0.25rem' }}>📚 Farm Bible</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Institutional knowledge, key people, enterprise economics, contracts, and field history — the living record of Upper Assendon Farm.
        </p>
        {expiringSoon > 0 && (
          <div style={{ marginTop: '0.5rem', background: '#fff3cd', border: '1px solid #ffe082', borderRadius: 'var(--radius)', padding: '6px 12px', fontSize: 13, color: '#a67c00' }}>
            ⚠️ {expiringSoon} agreement{expiringSoon > 1 ? 's' : ''} expiring within 12 months
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: '1.25rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>
        {BIBLE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              borderRadius: 'var(--radius)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: activeTab === tab.id ? 'var(--green)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Chapter content */}
      {activeTab === 'overview' && <OverviewChapter bible={bible} onSave={onSave} />}
      {activeTab === 'people' && <PeopleChapter bible={bible} onSave={onSave} />}
      {activeTab === 'enterprises' && <EnterprisesChapter bible={bible} onSave={onSave} />}
      {activeTab === 'agreements' && <AgreementsChapter bible={bible} onSave={onSave} />}
      {activeTab === 'fields' && <FieldNotesChapter bible={bible} db={db} onSave={onSave} />}
      {activeTab === 'decisions' && <DecisionsChapter bible={bible} onSave={onSave} />}
    </div>
  );
}
