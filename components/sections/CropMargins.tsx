'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FarmData, FieldYield, CropMarginSettings, FieldMarginOverride, MarginGroup } from '@/lib/types';
import { computeMargins, settingsFor, GROUPS, type FieldMargin, type GroupMargin } from '@/lib/cropMargins';

// Money → Crop margins. What each crop and field made per hectare for one
// harvest, from the Hub's own records. Only the figures typed here are saved
// (data.cropMargins[harvest]); see lib/cropMargins.ts for how costs are found.

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
}

const HARVEST = '2026';
const gbp = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined || !isFinite(n) ? '—' : `${n < 0 ? '−' : ''}£${Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: dp })}`;
const num = (n: number | null | undefined, dp = 2) => (n === null || n === undefined || !isFinite(n) ? '—' : n.toFixed(dp));
const marginColour = (n: number | null) => (n === null ? 'var(--text-muted)' : n < 0 ? 'var(--red)' : 'var(--green)');

/** A number box that saves when you leave it (so typing doesn't save every key). */
function NumBox({ value, onSave, placeholder, width = 90, step = 'any', label }: {
  value: number | null | undefined; onSave: (v: number | null) => void; placeholder?: string; width?: number | string; step?: string; label?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => { setText(value === null || value === undefined ? '' : String(value)); }, [value]);
  const commit = () => {
    const v = text.trim() === '' ? null : Number(text);
    if (v !== null && !isFinite(v)) return;
    if (v !== (value ?? null)) onSave(v);
  };
  return (
    <input type="number" inputMode="decimal" step={step} value={text} placeholder={placeholder} aria-label={label}
      onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ width, marginBottom: 0 }} />
  );
}

export default function CropMargins({ db, persist }: Props) {
  const [yields, setYields] = useState<FieldYield[]>([]);
  const [yieldError, setYieldError] = useState('');
  const [open, setOpen] = useState<MarginGroup | null>(null);
  const [fieldOpen, setFieldOpen] = useState<string | null>(null);
  const [showPriced, setShowPriced] = useState(false);

  useEffect(() => {
    fetch('/api/yields')
      .then(r => (r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error)))))
      .then(setYields)
      .catch(e => setYieldError(e.message));
  }, []);

  const s = settingsFor(db, HARVEST);
  const r = useMemo(() => computeMargins(db, yields, HARVEST), [db, yields]);

  const save = (patch: Partial<CropMarginSettings>) =>
    persist({ ...db, cropMargins: { ...db.cropMargins, [HARVEST]: { ...s, ...patch, updatedAt: new Date().toISOString() } } });
  const setOverride = (id: string, patch: Partial<FieldMarginOverride>) => {
    const next = { ...s.overrides[id], ...patch };
    for (const k of Object.keys(next) as (keyof FieldMarginOverride)[]) if (next[k] === null || next[k] === undefined || next[k] === '') delete next[k];
    const overrides = { ...s.overrides };
    if (Object.keys(next).length) overrides[id] = next; else delete overrides[id];
    save({ overrides });
  };

  const unpriced = r.chemPrices.filter(c => c.price === null);
  const noYield = r.fields.filter(f => f.yieldTha === null).length;
  const noPrice = r.groups.filter(g => g.fields.length && g.price === null);
  const ownGroups = r.groups.filter(g => g.id !== 'grange' && g.fields.length);
  const allOwnHa = r.whole.ownAreaHa + r.grange.areaHa;

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>Crop margins · harvest {HARVEST}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.6 }}>
          Sale value less sprays, fertiliser and seed, per crop and per field. Sprays are Luke’s recs priced at what Crop Advisors charged;
          fertiliser is the John Deere spreading records. Anything you type here overrides the records, and is saved.
        </div>
      </div>

      {/* What's still missing */}
      {(r.notes.length > 0 || unpriced.length > 0 || r.extrasUnassigned > 0 || noYield > 0 || noPrice.length > 0 || yieldError) && (
        <div className="card" style={{ borderLeft: '4px solid var(--amber)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
          <div className="card-title">Still to fill in</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {yieldError && <li>Couldn’t load the yields table ({yieldError}). Yields from the cropping plan are used instead.</li>}
            {noPrice.length > 0 && <li>No sale price yet for {noPrice.map(g => g.label.toLowerCase()).join(', ')}. Type it in the crop’s box below.</li>}
            {noYield > 0 && <li>{noYield} field{noYield > 1 ? 's have' : ' has'} no yield. Tap the crop, then the field, to type one in.</li>}
            {unpriced.length > 0 && <li>{unpriced.length} sprays on Luke’s recs have no price (not on a Crop Advisors statement): {unpriced.map(c => c.name).join(', ')}. They count as £0 until you add a price below.</li>}
            {r.extrasUnassigned > 0 && <li>{gbp(r.extrasUnassigned)} of chemicals bought aren’t on any rec. Say which crop they went on, below, or they’re left out.</li>}
            {r.notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}

      {r.info.map(t => <div key={t} className="row-sub" style={{ margin: '0 0 1rem', lineHeight: 1.6 }}>{t}</div>)}

      {/* By crop */}
      {GROUPS.map(gdef => {
        const g = r.groups.find(x => x.id === gdef.id)!;
        if (!g.fields.length) return null;
        return <CropCard key={g.id} g={g} s={s} open={open === g.id} onToggle={() => { setOpen(open === g.id ? null : g.id); setFieldOpen(null); }}
          fieldOpen={fieldOpen} setFieldOpen={setFieldOpen} save={save} setOverride={setOverride} />;
      })}

      {/* Grange */}
      {r.grange.areaHa > 0 && (
        <div className="card hub-form">
          <div className="card-title">Grange: our side of the Knowles agreement</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
            The farmer’s charge and our contractor’s fee come off the crop’s margin first, then what’s left is shared.
            Check these against the contract farming agreement.
          </div>
          <div className="field-row">
            <div><label className="form-label">Farmer’s charge £/acre</label><NumBox width="100%" value={s.grange.farmersChargePerAc} onSave={v => save({ grange: { ...s.grange, farmersChargePerAc: v ?? 0 } })} /></div>
            <div><label className="form-label">Our contractor’s fee £/acre</label><NumBox width="100%" value={s.grange.contractorsFeePerAc} onSave={v => save({ grange: { ...s.grange, contractorsFeePerAc: v ?? 0 } })} /></div>
          </div>
          <div className="field-row">
            <div><label className="form-label">Our share of what’s left %</label><NumBox width="100%" value={s.grange.sharePct} onSave={v => save({ grange: { ...s.grange, sharePct: v ?? 50 } })} /></div>
            <div><label className="form-label">Management fee received £</label><NumBox width="100%" value={s.grange.managementFee} placeholder="not entered" onSave={v => save({ grange: { ...s.grange, managementFee: v ?? undefined } })} /></div>
          </div>
          <Lines rows={[
            [`Wheat sold (${num(r.grange.areaHa, 1)} ha, ${num(r.grange.acres, 1)} acres)`, gbp(r.grange.revenue)],
            ['less sprays, fertiliser and seed', gbp(-r.grange.direct)],
            ['less farmer’s charge', gbp(-r.grange.farmersCharge)],
            ['less our contractor’s fee', gbp(-r.grange.contractorsFee)],
            ['= left to share', gbp(r.grange.surplus), true],
            [`Our ${s.grange.sharePct}% share`, gbp(r.grange.ourShare)],
            ['+ our contractor’s fee', gbp(r.grange.contractorsFee)],
            ['+ management fee', gbp(r.grange.managementFee)],
            ['= what Grange brings us (before our machinery and labour)', gbp(r.grange.ourIncome), true],
          ]} />
        </div>
      )}

      {/* Whole farm */}
      <div className="card hub-form">
        <div className="card-title">Before and after overheads</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>Leave any you don’t know yet blank. Whole-year £ for the arable side.</div>
        <div className="field-row">
          <div><label className="form-label">Rent and licences £</label><NumBox width="100%" value={s.overheads.rent} onSave={v => save({ overheads: { ...s.overheads, rent: v ?? undefined } })} /></div>
          <div><label className="form-label">Labour £</label><NumBox width="100%" value={s.overheads.labour} onSave={v => save({ overheads: { ...s.overheads, labour: v ?? undefined } })} /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Machinery £</label><NumBox width="100%" value={s.overheads.machinery} onSave={v => save({ overheads: { ...s.overheads, machinery: v ?? undefined } })} /></div>
          <div><label className="form-label">Fuel £</label><NumBox width="100%" value={s.overheads.fuel} onSave={v => save({ overheads: { ...s.overheads, fuel: v ?? undefined } })} /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Other overheads £</label><NumBox width="100%" value={s.overheads.other} onSave={v => save({ overheads: { ...s.overheads, other: v ?? undefined } })} /></div>
          <div><label className="form-label">Scheme income £ (SFI, CS)</label><NumBox width="100%" value={s.overheads.schemeIncome} onSave={v => save({ overheads: { ...s.overheads, schemeIncome: v ?? undefined } })} /></div>
        </div>
        <Lines rows={[
          ...ownGroups.map(g => [`${g.label}${g.missing.length ? ` (${g.fields.length - g.missing.length} of ${g.fields.length} fields)` : ''}`, gbp(g.costedAreaHa ? g.margin : null)] as [string, string]),
          ['Margin before overheads, our own crops', gbp(r.whole.ownMargin), true],
          ['+ what Grange brings us', gbp(r.whole.grangeIncome)],
          ['less overheads', gbp(-r.whole.overheads)],
          ['+ scheme income', gbp(r.whole.schemeIncome)],
          ['= after overheads', gbp(r.whole.net), true],
          [`per hectare (${num(allOwnHa, 0)} ha incl. Grange)`, gbp(allOwnHa ? r.whole.net / allOwnHa : null)],
        ]} />
        {!r.whole.ownComplete && <div className="row-sub" style={{ marginTop: 6 }}>Only fields with a yield and a price are counted so far.</div>}
      </div>

      {/* Fertiliser */}
      <div className="card hub-form">
        <div className="card-title">Fertiliser prices</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
          One dressing per spreading day in John Deere. Where Deere didn’t measure the rate, the usual rate below is used.
        </div>
        <div className="field-row">
          <div>
            <label className="form-label">Nitrogen 33.5% £/t</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <NumBox width="100%" value={s.anPricePerT} onSave={v => save({ anPricePerT: v ?? 340 })} />
              <button className="btn-cancel" style={{ whiteSpace: 'nowrap' }} onClick={() => save({ anPricePerT: s.anPricePerT === 500 ? 340 : 500 })}>{s.anPricePerT === 500 ? 'Back to £340' : 'Try £500'}</button>
            </div>
          </div>
          <div><label className="form-label">Sulphur (26N + 35SO3) £/t</label><NumBox width="100%" value={s.sulphurPricePerT} onSave={v => save({ sulphurPricePerT: v ?? 324 })} /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Usual nitrogen dressing kg/ha</label><NumBox width="100%" value={s.anRateKgHa} onSave={v => save({ anRateKgHa: v ?? 137 })} /></div>
          <div><label className="form-label">Usual sulphur dressing kg/ha</label><NumBox width="100%" value={s.sulphurRateKgHa} onSave={v => save({ sulphurRateKgHa: v ?? 135 })} /></div>
        </div>
      </div>

      {/* Chemical prices */}
      <div className="card hub-form">
        <div className="card-title">Spray prices</div>
        {unpriced.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>On Luke’s recs but not on any Crop Advisors statement. Add a price (£ per litre or kg):</div>
            {unpriced.map(c => (
              <div key={c.name} className="row-item">
                <div style={{ minWidth: 0 }}>
                  <div className="row-name">{c.name}</div>
                  <div className="row-sub">{num(c.usedQty, 1)} {c.unit} used on the recs{c.hint ? ` · ${c.hint}` : ''}</div>
                </div>
                <NumBox value={s.chemPrices[c.name]} placeholder={`£/${c.unit}`} label={`${c.name} price`} onSave={v => save({ chemPrices: { ...s.chemPrices, [c.name]: v } })} />
              </div>
            ))}
          </>
        )}
        <button className="btn-cancel" style={{ marginTop: 10 }} onClick={() => setShowPriced(x => !x)}>
          {showPriced ? 'Hide' : 'Show'} the {r.chemPrices.length - unpriced.length} priced sprays
        </button>
        {showPriced && r.chemPrices.filter(c => c.price !== null).map(c => (
          <div key={c.name} className="row-item">
            <div style={{ minWidth: 0 }}>
              <div className="row-name">{c.name} · {gbp(c.price, 2)}/{c.unit}</div>
              <div className="row-sub">{num(c.usedQty, 1)} {c.unit} on the recs = {gbp(c.cost)} · {c.source}</div>
            </div>
            <NumBox value={s.chemPrices[c.name]} placeholder="change" label={`${c.name} price`} onSave={v => save({ chemPrices: { ...s.chemPrices, [c.name]: v } })} />
          </div>
        ))}
      </div>

      {/* Bought, not on a rec */}
      <div className="card hub-form">
        <div className="card-title">Bought but not on a rec</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.6 }}>
          On the Crop Advisors statements but on none of Luke’s recs in the Hub. Pick the crop each went on and its cost is spread per hectare across that crop.
        </div>
        {r.extras.map(e => (
          <div key={e.name} className="row-item">
            <div style={{ minWidth: 0 }}>
              <div className="row-name">{e.name} · {gbp(e.total)}</div>
              <div className="row-sub">{e.bought}{e.hint ? ` · ${e.hint}` : ''}</div>
            </div>
            <select value={e.use} onChange={ev => save({ extraUse: { ...s.extraUse, [e.name]: ev.target.value } })} style={{ width: 150, marginBottom: 0 }} aria-label={`${e.name} went on`}>
              <option value="">Not sure yet</option>
              {GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              <option value="none">Not these crops</option>
            </select>
          </div>
        ))}
      </div>
    </>
  );
}

function Lines({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <div style={{ marginTop: 6 }}>
      {rows.map(([label, value, bold], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 14, fontWeight: bold ? 600 : 400, borderTop: bold ? '1px solid var(--border)' : undefined }}>
          <span>{label}</span><span style={{ whiteSpace: 'nowrap' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 17, fontFamily: 'Lora, serif', color: colour || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function CropCard({ g, s, open, onToggle, fieldOpen, setFieldOpen, save, setOverride }: {
  g: GroupMargin; s: CropMarginSettings; open: boolean; onToggle: () => void;
  fieldOpen: string | null; setFieldOpen: (id: string | null) => void;
  save: (patch: Partial<CropMarginSettings>) => void; setOverride: (id: string, patch: Partial<FieldMarginOverride>) => void;
}) {
  return (
    <div className="card hub-form">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 18 }}>{g.label}</div>
          <div className="row-sub">{num(g.areaHa, 1)} ha · {g.fields.length} field{g.fields.length > 1 ? 's' : ''}{g.note ? ` · ${g.note}` : ''}</div>
        </div>
        <button className="btn-cancel" onClick={onToggle}>{open ? 'Hide fields' : 'Show fields'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, margin: '12px 0' }}>
        <Stat label="Yield t/ha" value={num(g.yieldTha)} />
        <Stat label="Costs £/ha" value={gbp(g.directPerHa)} />
        <Stat label="Margin £/ha" value={gbp(g.marginPerHa)} colour={marginColour(g.marginPerHa)} />
        <Stat label="Cost £/t" value={gbp(g.costPerT)} />
      </div>

      <div className="field-row">
        <div>
          <label className="form-label">Sale price £/t{g.priceSource ? ` (${g.priceSource})` : ''}</label>
          <NumBox width="100%" value={s.prices[g.id]} placeholder={g.priceSource && g.price !== null ? String(g.price) : 'not set'} onSave={v => save({ prices: { ...s.prices, [g.id]: v } })} />
        </div>
        <div>
          <label className="form-label">Seed £/ha</label>
          <NumBox width="100%" value={s.seedPerHa[g.id]} placeholder="not set" onSave={v => save({ seedPerHa: { ...s.seedPerHa, [g.id]: v } })} />
        </div>
      </div>
      {g.missing.length > 0 && g.missing.length < g.fields.length && (
        <div className="row-sub">Margin leaves out {g.missing.join(', ')} (no yield yet).</div>
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          {g.fields.map(f => (
            <FieldRow key={f.id} f={f} open={fieldOpen === f.id} onToggle={() => setFieldOpen(fieldOpen === f.id ? null : f.id)} setOverride={setOverride} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({ f, open, onToggle, setOverride }: {
  f: FieldMargin; open: boolean; onToggle: () => void; setOverride: (id: string, patch: Partial<FieldMarginOverride>) => void;
}) {
  const o = f.override;
  const typed = (k: keyof FieldMarginOverride) => (o[k] !== undefined ? ' (typed)' : '');
  return (
    <div style={{ borderTop: '1px solid var(--gray-mid)', padding: '9px 0' }}>
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row-name">{f.name}</div>
          <div className="row-sub">
            {num(f.areaHa, 2)} ha · {f.yieldTha === null ? 'no yield' : `${num(f.yieldTha)} t/ha`} · costs {gbp(f.directPerHa)}/ha
            {f.costPerT !== null ? ` · ${gbp(f.costPerT)}/t` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 600, color: marginColour(f.marginPerHa) }}>{gbp(f.marginPerHa)}</div>
          <div className="row-sub">margin/ha</div>
        </div>
      </div>

      {open && (
        <div style={{ background: 'var(--gray-pale)', borderRadius: 'var(--radius)', padding: 10, marginTop: 8 }}>
          <Lines rows={[
            [f.yieldTha === null ? 'Sold: no yield yet' : f.price === null ? `Sold ${num(f.yieldTha)} t/ha: no price set` : `Sold ${num(f.yieldTha)} t/ha × ${gbp(f.price)}/t`, gbp(f.revenuePerHa)],
            [`Sprays (Luke’s recs)${typed('sprayPerHa')}`, gbp(f.sprayPerHa)],
            ...(f.extrasPerHa ? [['Sprays bought, not on a rec', gbp(f.extrasPerHa)] as [string, string]] : []),
            [`Fertiliser${typed('fertPerHa')}`, gbp(f.fertPerHa)],
            [`Seed${typed('seedPerHa')}`, gbp(f.seedPerHa)],
            ['Margin per ha', gbp(f.marginPerHa), true],
          ]} />
          {f.unpriced.length > 0 && <div className="row-sub" style={{ marginTop: 4 }}>No price yet for {f.unpriced.join(', ')}.</div>}

          <div className="form-label" style={{ marginTop: 12 }}>Spray recs ({f.sprays.length})</div>
          {f.sprays.map((x, i) => (
            <div key={i} className="row-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{x.date.slice(8, 10)}/{x.date.slice(5, 7)} · {x.report} · {x.products}{x.share < 0.99 ? ` · part field (${Math.round(x.share * 100)}%)` : ''}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{gbp(x.perHa)}</span>
            </div>
          ))}
          <div className="form-label" style={{ marginTop: 10 }}>Fertiliser: {f.fertSource}</div>
          <div className="row-sub" style={{ marginBottom: 2 }}>John Deere shows {f.ferts.length} dressing{f.ferts.length === 1 ? '' : 's'}:</div>
          {f.ferts.length === 0 && <div className="row-sub">None in John Deere.</div>}
          {f.ferts.map((x, i) => (
            <div key={i} className="row-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{x.date.slice(8, 10)}/{x.date.slice(5, 7)} · {x.product} · {Math.round(x.kgHa)} kg/ha{x.measured ? '' : ' (usual rate)'}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{gbp(x.perHa)}</span>
            </div>
          ))}

          <div className="form-label" style={{ marginTop: 12 }}>Type your own figures (blank = use the records)</div>
          <div className="field-row">
            <div><label className="form-label">Yield t/ha{f.yieldSource && !o.yieldTha ? ` (now from ${f.yieldSource})` : ''}</label><NumBox width="100%" value={o.yieldTha} placeholder={f.yieldTha === null ? '' : String(f.yieldTha)} onSave={v => setOverride(f.id, { yieldTha: v ?? undefined })} /></div>
            <div><label className="form-label">Area ha</label><NumBox width="100%" value={o.areaHa} placeholder={String(f.areaHa)} onSave={v => setOverride(f.id, { areaHa: v ?? undefined })} /></div>
          </div>
          <div className="field-row">
            <div><label className="form-label">Sprays £/ha</label><NumBox width="100%" value={o.sprayPerHa} placeholder={f.sprayPerHa.toFixed(0)} onSave={v => setOverride(f.id, { sprayPerHa: v ?? undefined })} /></div>
            <div><label className="form-label">Fertiliser £/ha</label><NumBox width="100%" value={o.fertPerHa} placeholder={f.fertPerHa.toFixed(0)} onSave={v => setOverride(f.id, { fertPerHa: v ?? undefined })} /></div>
          </div>
          <div className="field-row">
            <div><label className="form-label">Seed £/ha</label><NumBox width="100%" value={o.seedPerHa} placeholder={f.seedPerHa.toFixed(0)} onSave={v => setOverride(f.id, { seedPerHa: v ?? undefined })} /></div>
            <div />
          </div>
          <label className="form-label">Note</label>
          <input type="text" defaultValue={o.note || ''} placeholder="e.g. yield from the weighbridge tickets" onBlur={e => { if (e.target.value !== (o.note || '')) setOverride(f.id, { note: e.target.value || undefined }); }} />
        </div>
      )}
    </div>
  );
}
