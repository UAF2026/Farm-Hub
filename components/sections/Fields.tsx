'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FarmData, MasterField, FieldYield } from '@/lib/types';
import { cropHistory, currentHarvestYear, jdOpsForField, unlinkedJdNames, LAND_BLOCKS } from '@/lib/fields';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  addActivity: (msg: string) => void;
}

const USE_LABEL: Record<MasterField['use'], string> = { arable: 'Arable', grass: 'Grass', other: 'Other', unknown: 'Use not set' };
const USE_BADGE: Record<MasterField['use'], string> = { arable: 'bg-amber', grass: 'bg-green', other: 'bg-gray', unknown: 'bg-gray' };
const fmtHa = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)} ha`;
const fmtD = (d?: string) => (d ? d.slice(5).split('-').reverse().join('/') + '/' + d.slice(2, 4) : '');

function useYields() {
  const [yields, setYields] = useState<FieldYield[]>([]);
  const [error, setError] = useState('');
  const reload = () =>
    fetch('/api/yields')
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error))))
      .then(setYields)
      .catch(e => setError(e.message));
  useEffect(() => { reload(); }, []);
  return { yields, error, reload };
}

export default function Fields({ db, persist, addActivity }: Props) {
  const register = db.fieldRegister || [];
  const { yields, error: yieldError, reload } = useYields();
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [land, setLand] = useState('');
  const [onlyToCheck, setOnlyToCheck] = useState(false);

  const save = (next: MasterField[]) => persist({ ...db, fieldRegister: next });
  const update = (f: MasterField) => save(register.map(x => (x.id === f.id ? f : x)));

  const harvest = currentHarvestYear();
  const lastHarvest = harvest - 1;
  const ignoredJd = (db.jdFieldMap || []).filter(e => e.hubParcel === '__IGNORE__').map(e => e.jdName);
  const unlinked = useMemo(() => unlinkedJdNames(register, db.jdOperations, ignoredJd), [register, db.jdOperations]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!register.length) {
    return <div className="card"><div className="card-title">Fields</div><div className="empty">The master field list hasn’t loaded. Reload the page; if it’s still empty, the list needs setting up again.</div></div>;
  }

  const open = register.find(f => f.id === openId);
  if (open) {
    return (
      <FieldPage
        field={open} db={db} yields={yields.filter(y => y.field_id === open.id)} unlinked={unlinked}
        onBack={() => setOpenId(null)} onChange={update} onYieldsChanged={reload} addActivity={addActivity}
      />
    );
  }

  const active = register.filter(f => f.status === 'active');
  const total = active.reduce((a, f) => a + f.areaHa, 0);
  const byUse = (u: MasterField['use']) => active.filter(f => f.use === u).reduce((a, f) => a + f.areaHa, 0);
  const toCheck = register.filter(f => !f.linksChecked && !f.confirmed);

  const q = search.trim().toLowerCase();
  const shown = register.filter(f =>
    (!q || [f.name, ...(f.gkNames || []), ...(f.otherNames || []), ...f.jdNames, ...f.rpaParcels].some(s => s.toLowerCase().includes(q))) &&
    (!land || (f.land || 'Not set') === land) &&
    (!onlyToCheck || (!f.linksChecked && !f.confirmed)));
  const groups = new Map<string, MasterField[]>();
  for (const f of shown) {
    const key = f.status !== 'active' ? 'Not farmed (offcuts, not ours)' : f.land || 'Land block not set';
    groups.set(key, [...(groups.get(key) || []), f]);
  }
  const order = [...LAND_BLOCKS, 'Land block not set', 'Not farmed (offcuts, not ours)'];
  const groupKeys = Array.from(groups.keys()).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99 || a.localeCompare(b));
  const lastYield = (id: string) => yields.find(y => y.field_id === id && y.harvest_year === String(lastHarvest));
  const thisSeason = (f: MasterField) => cropHistory(f, db).find(l => l.harvest === harvest);

  return (
    <>
      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Fields farmed</div><div className="metric-value">{active.length}</div><div className="metric-sub">{fmtHa(total)} · {Math.round(total * 2.471)} acres</div></div>
        <div className="metric-card"><div className="metric-label">Arable / grass</div><div className="metric-value">{Math.round(byUse('arable'))} / {Math.round(byUse('grass'))}</div><div className="metric-sub">ha{byUse('unknown') ? ` · ${Math.round(byUse('unknown'))} ha not set` : ''}</div></div>
        <div className="metric-card"><div className="metric-label">Need checking</div><div className="metric-value">{toCheck.length}</div><div className="metric-sub">links matched by name or area</div></div>
        <div className="metric-card"><div className="metric-label">Yields {lastHarvest}</div><div className="metric-value">{yields.filter(y => y.harvest_year === String(lastHarvest)).length}</div><div className="metric-sub">fields recorded</div></div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
          <input type="text" placeholder="Search fields, other names or parcel numbers…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 220px', marginBottom: 0 }} />
          <select value={land} onChange={e => setLand(e.target.value)} style={{ flex: '0 1 200px', marginBottom: 0 }}>
            <option value="">All land</option>
            {[...LAND_BLOCKS, 'Not set'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={onlyToCheck} onChange={e => setOnlyToCheck(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
            Only ones to check
          </label>
        </div>

        {groupKeys.map(g => (
          <div key={g} style={{ marginBottom: '1rem' }}>
            <div className="link-group-title">{g} · {fmtHa(groups.get(g)!.reduce((a, f) => a + f.areaHa, 0))}</div>
            {groups.get(g)!.map(f => {
              const s = thisSeason(f);
              const y = lastYield(f.id);
              return (
                <div key={f.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setOpenId(f.id)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row-name">
                      {f.name}
                      {f.confirmed ? <span title="Checked by James" style={{ color: 'var(--green)', marginLeft: 6 }}>✓</span>
                        : !f.linksChecked ? <span title="Links need checking" style={{ color: 'var(--amber)', marginLeft: 6 }}>⚠</span> : null}
                    </div>
                    <div className="row-sub">
                      {fmtHa(f.areaHa)}{f.areaSource === 'gatekeeper' ? ' (Gatekeeper)' : ''}
                      {s ? ` · ${seasonLabel(harvest)}: ${s.crop}${s.variety ? ` (${s.variety})` : ''}` : ''}
                      {y?.yield_t_per_ha ? ` · ${lastHarvest}: ${y.yield_t_per_ha} t/ha` : ''}
                    </div>
                  </div>
                  <span className={`badge ${USE_BADGE[f.use]}`}>{USE_LABEL[f.use]}</span>
                </div>
              );
            })}
          </div>
        ))}
        {!groupKeys.length && <div className="empty">No fields match.</div>}
      </div>

      {unlinked.length > 0 && (
        <div className="card">
          <div className="card-title">John Deere fields not linked to anything ({unlinked.length})</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            Jobs on these aren’t counted against any field. Open the right field above and add the name, or tell Claude which field each one is.
          </p>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>{unlinked.join(' · ')}</div>
        </div>
      )}
      {yieldError && <div className="empty">Couldn’t load yields: {yieldError}</div>}
    </>
  );
}

function seasonLabel(harvest: number) {
  return `${String(harvest - 1).slice(2)}/${String(harvest).slice(2)}`;
}

/* ─── One field ──────────────────────────────────────────────────────────── */

function FieldPage({ field, db, yields, unlinked, onBack, onChange, onYieldsChanged, addActivity }: {
  field: MasterField; db: FarmData; yields: FieldYield[]; unlinked: string[];
  onBack: () => void; onChange: (f: MasterField) => void; onYieldsChanged: () => void; addActivity: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field);
  const [addJd, setAddJd] = useState('');
  useEffect(() => { setDraft(field); }, [field]);

  const history = cropHistory(field, db);
  const ops = jdOpsForField(field, db.jdOperations);
  const sprays = (db.sprays || []).filter(s => [field.name, ...(field.gkNames || []), ...field.jdNames].some(n => n.toLowerCase() === (s.field || '').toLowerCase()));
  const yieldFor = (h: number) => yields.find(y => y.harvest_year === String(h));

  function saveDraft() {
    onChange({ ...draft, name: draft.name.trim() || field.name, areaHa: Number(draft.areaHa) || field.areaHa });
    setEditing(false);
    addActivity(`Updated field ${draft.name}`);
  }

  return (
    <>
      <button className="btn-cancel" onClick={onBack} style={{ marginBottom: '0.75rem' }}>← All fields</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>{field.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {fmtHa(field.areaHa)} ({Math.round(field.areaHa * 2.471 * 10) / 10} acres) · {field.land || 'land block not set'} · {USE_LABEL[field.use]}
            </div>
          </div>
          {!editing && <button className="btn-primary" onClick={() => setEditing(true)}>Edit</button>}
        </div>

        {!field.confirmed && !editing && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: field.linksChecked ? 'var(--gray-pale)' : '#fdf3e3', borderRadius: 'var(--radius)', fontSize: 13 }}>
            {field.linksChecked ? 'Links look right but you haven’t ticked this field off yet.' : '⚠ Some links below were matched by name or area. Please check them.'}
            {field.notes ? <div style={{ marginTop: 4 }}>{field.notes}</div> : null}
            <button className="btn-add" style={{ marginTop: 8 }} onClick={() => { onChange({ ...field, confirmed: true }); addActivity(`Checked field ${field.name}`); }}>
              ✓ This is all correct
            </button>
          </div>
        )}
        {field.confirmed && field.notes && !editing && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>{field.notes}</div>}

        {editing && (
          <div style={{ marginTop: 12 }}>
            <div className="grid2">
              <div><label className="form-label">Name</label><input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
              <div>
                <label className="form-label">Area (ha){field.areaSource === 'rpa' ? ' — from RPA' : ''}</label>
                <input type="number" step="0.01" value={draft.areaHa} onChange={e => setDraft({ ...draft, areaHa: Number(e.target.value), areaSource: 'manual' })} />
              </div>
              <div>
                <label className="form-label">Land block / agreement</label>
                <input type="text" list="land-blocks" value={draft.land} onChange={e => setDraft({ ...draft, land: e.target.value })} />
                <datalist id="land-blocks">{LAND_BLOCKS.map(l => <option key={l} value={l} />)}</datalist>
              </div>
              <div>
                <label className="form-label">Use</label>
                <select value={draft.use} onChange={e => setDraft({ ...draft, use: e.target.value as MasterField['use'] })}>
                  {(['arable', 'grass', 'other', 'unknown'] as const).map(u => <option key={u} value={u}>{USE_LABEL[u]}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as MasterField['status'] })}>
                  <option value="active">Farmed</option><option value="offcut">Offcut</option><option value="not-ours">Not ours</option>
                </select>
              </div>
            </div>
            <label className="form-label">John Deere field names</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {draft.jdNames.map(n => (
                <span key={n} className="badge bg-gray" style={{ fontSize: 12 }}>
                  {n} <button onClick={() => setDraft({ ...draft, jdNames: draft.jdNames.filter(x => x !== n) })} style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: 4 }} aria-label={`Remove ${n}`}>×</button>
                </span>
              ))}
              {!draft.jdNames.length && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>None</span>}
            </div>
            {unlinked.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <select value={addJd} onChange={e => setAddJd(e.target.value)} style={{ marginBottom: 0 }}>
                  <option value="">Add an unlinked John Deere field…</option>
                  {unlinked.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button className="btn-add" disabled={!addJd} onClick={() => { setDraft({ ...draft, jdNames: [...draft.jdNames, addJd] }); setAddJd(''); }}>Add</button>
              </div>
            )}
            <label className="form-label">Notes</label>
            <textarea rows={3} value={draft.notes || ''} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 12px' }}>
              <input type="checkbox" checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} style={{ width: 'auto', marginBottom: 0 }} />
              I’ve checked this field and its links are right
            </label>
            <div className="modal-btns" style={{ justifyContent: 'flex-start' }}>
              <button className="btn-primary" onClick={saveDraft}>Save</button>
              <button className="btn-cancel" onClick={() => { setDraft(field); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        )}

        {!editing && (
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7 }}>
            {field.otherNames?.length ? <div><strong>Also called:</strong> {field.otherNames.join(', ')}</div> : null}
            <div><strong>RPA parcels:</strong> {field.rpaParcels.length ? field.rpaParcels.join(', ') : 'none — not on our SBI'}</div>
            <div><strong>Gatekeeper:</strong> {field.gkNames?.length ? `${field.gkNames.join(', ')}${field.gkAreaHa ? ` (${field.gkAreaHa} ha)` : ''}` : 'none'}</div>
            <div><strong>John Deere:</strong> {field.jdNames.length ? `${field.jdNames.join(', ')} · ${ops.length} jobs recorded` : 'none linked'}</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Field history</div>
        {history.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="hist-table">
              <thead><tr><th>Harvest</th><th>Crop</th><th>John Deere jobs</th><th>Yield</th></tr></thead>
              <tbody>
                {history.map(l => {
                  const y = yieldFor(l.harvest);
                  return (
                    <tr key={l.harvest}>
                      <td>{l.harvest}<div className="row-sub">{l.season}</div></td>
                      <td>{l.crop}{l.variety ? <div className="row-sub">{l.variety}</div> : null}</td>
                      <td>
                        {l.events.map((e, i) => (
                          <div key={i} style={{ marginBottom: 2 }}>
                            {e.kind === 'drilled' ? 'Drilled' : 'Harvested'} {fmtD(e.date)}
                            {e.crop || e.variety ? <span className="row-sub" style={{ display: 'inline' }}> · {[e.crop, e.variety].filter(Boolean).join(', ')}</span> : null}
                          </div>
                        ))}
                      </td>
                      <td>{y?.yield_t_per_ha != null ? `${y.yield_t_per_ha} t/ha` : l.targetYield && l.harvest >= currentHarvestYear() ? <span className="row-sub">target {l.targetYield}</span> : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">No cropping history linked to this field yet.</div>}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Crops from the cropping plan where there is one, otherwise Gatekeeper (2022–27). John Deere jobs start in 2024; “Harvested” includes grass cuts.
          {sprays.length ? ` ${sprays.length} spray records in Compliance.` : ''}
        </div>
      </div>

      <YieldsCard field={field} yields={yields} onChanged={onYieldsChanged} addActivity={addActivity} />
    </>
  );
}

/* ─── Yields ─────────────────────────────────────────────────────────────── */

function YieldsCard({ field, yields, onChanged, addActivity }: { field: MasterField; yields: FieldYield[]; onChanged: () => void; addActivity: (m: string) => void }) {
  const blank = (): FieldYield => ({ field_id: field.id, field_name: field.name, rpa_parcel: field.rpaParcels[0] || null, harvest_year: String(currentHarvestYear() - 1), crop: '', area_ha: field.areaHa });
  const [form, setForm] = useState<FieldYield | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!form) return;
    setBusy(true); setErr('');
    const area = Number(form.area_ha) || field.areaHa;
    const body = {
      ...form,
      total_tonnes: form.total_tonnes ?? (form.yield_t_per_ha ? Math.round(Number(form.yield_t_per_ha) * area * 10) / 10 : null),
      yield_t_per_ha: form.yield_t_per_ha ?? (form.total_tonnes ? Math.round((Number(form.total_tonnes) / area) * 100) / 100 : null),
    };
    const res = await fetch('/api/yields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || 'Save failed'); return; }
    addActivity(`Recorded ${form.harvest_year} yield for ${field.name}`);
    setForm(null);
    onChanged();
  }

  async function remove(y: FieldYield) {
    if (!y.id || !confirm(`Delete the ${y.harvest_year} yield for ${field.name}?`)) return;
    await fetch(`/api/yields?id=${y.id}`, { method: 'DELETE' });
    onChanged();
  }

  const set = (k: keyof FieldYield) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form!, [k]: e.target.value === '' ? null : e.target.value });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="card-title" style={{ margin: 0 }}>Yields</div>
        {!form && <button className="btn-add" onClick={() => setForm(blank())}>+ Add yield</button>}
      </div>

      {form && (
        <div style={{ marginTop: 12 }}>
          <div className="grid2">
            <div><label className="form-label">Harvest year</label><input type="number" value={form.harvest_year} onChange={set('harvest_year')} /></div>
            <div><label className="form-label">Crop</label><input type="text" list="yield-crops" value={form.crop || ''} onChange={set('crop')} placeholder="Winter wheat" /></div>
            <div><label className="form-label">Variety</label><input type="text" value={form.variety || ''} onChange={set('variety')} /></div>
            <div><label className="form-label">Area harvested (ha)</label><input type="number" step="0.01" value={form.area_ha ?? ''} onChange={set('area_ha')} /></div>
            <div><label className="form-label">Yield (t/ha)</label><input type="number" step="0.01" value={form.yield_t_per_ha ?? ''} onChange={set('yield_t_per_ha')} /></div>
            <div><label className="form-label">or total tonnes</label><input type="number" step="0.1" value={form.total_tonnes ?? ''} onChange={set('total_tonnes')} /></div>
            <div><label className="form-label">Moisture %</label><input type="number" step="0.1" value={form.moisture_pct ?? ''} onChange={set('moisture_pct')} /></div>
            <div><label className="form-label">Protein %</label><input type="number" step="0.1" value={form.protein_pct ?? ''} onChange={set('protein_pct')} /></div>
          </div>
          <datalist id="yield-crops">{['Winter wheat', 'Spring wheat', 'Winter barley', 'Spring barley', 'Spring beans', 'Winter beans', 'Ahiflower', 'Chia', 'Hay', 'Silage'].map(c => <option key={c} value={c} />)}</datalist>
          <label className="form-label">Notes</label>
          <input type="text" value={form.notes || ''} onChange={set('notes')} placeholder="Weighbridge tickets, combine monitor, estimate…" />
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{err}</div>}
          <div className="modal-btns" style={{ justifyContent: 'flex-start' }}>
            <button className="btn-primary" onClick={save} disabled={busy || !form.crop}>{busy ? 'Saving…' : 'Save yield'}</button>
            <button className="btn-cancel" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {yields.length ? (
        <div style={{ marginTop: 8 }}>
          {yields.map(y => (
            <div key={y.id} className="row-item">
              <div>
                <div className="row-name">{y.harvest_year} · {y.crop}{y.variety ? ` (${y.variety})` : ''}</div>
                <div className="row-sub">
                  {y.yield_t_per_ha != null ? `${y.yield_t_per_ha} t/ha` : ''}{y.total_tonnes != null ? ` · ${y.total_tonnes} t` : ''}
                  {y.moisture_pct != null ? ` · ${y.moisture_pct}% moisture` : ''}{y.protein_pct != null ? ` · ${y.protein_pct}% protein` : ''}
                  {y.notes ? ` · ${y.notes}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-cancel" onClick={() => setForm(y)}>Edit</button>
                <button className="del-btn" onClick={() => remove(y)} aria-label="Delete yield">×</button>
              </div>
            </div>
          ))}
        </div>
      ) : !form && <div className="empty">No yields recorded yet.</div>}
    </div>
  );
}
