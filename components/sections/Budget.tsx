'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FarmData, FieldYield, CropBudgetLine, CropBudgetSettings } from '@/lib/types';
import { computeBudget, type BudgetCrop } from '@/lib/budget';

// Money → Budget. Next harvest's crops costed at last harvest's real £/ha
// (lib/budget.ts). Only what's typed here is saved (data.cropBudget[harvest]).

interface Props { db: FarmData; persist: (db: FarmData) => void; }

const HARVEST = '2027';
const gbp = (n: number | null | undefined) =>
  n === null || n === undefined || !isFinite(n) ? '—' : `${n < 0 ? '−' : ''}£${Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const colour = (n: number | null) => (n === null ? 'var(--text-muted)' : n < 0 ? 'var(--red)' : 'var(--green)');

function NumBox({ value, onSave, width = 80, label }: { value: number | null | undefined; onSave: (v: number | null) => void; width?: number; label: string }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(Math.round(value * 100) / 100));
  useEffect(() => { setText(value === null || value === undefined ? '' : String(Math.round(value * 100) / 100)); }, [value]);
  const commit = () => {
    const v = text.trim() === '' ? null : Number(text);
    if (v !== null && !isFinite(v)) return;
    const was = value === null || value === undefined ? null : Math.round(value * 100) / 100;
    if (v !== was) onSave(v);
  };
  return (
    <input type="number" inputMode="decimal" step="any" value={text} aria-label={label}
      onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ width, marginBottom: 0, padding: '5px 8px' }} />
  );
}

export default function Budget({ db, persist }: Props) {
  const [yields, setYields] = useState<FieldYield[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { fetch('/api/yields').then(r => (r.ok ? r.json() : [])).then(setYields).catch(() => {}); }, []);

  const b = useMemo(() => computeBudget(db, yields, HARVEST), [db, yields]);
  const mine: CropBudgetSettings = db.cropBudget?.[HARVEST] ?? { lines: {} };

  const save = (patch: Partial<CropBudgetSettings>) =>
    persist({ ...db, cropBudget: { ...db.cropBudget, [HARVEST]: { ...mine, ...patch, updatedAt: new Date().toISOString() } } });
  const setLine = (id: string, k: keyof CropBudgetLine, v: number | null) => {
    const line = { ...mine.lines[id], [k]: v };
    if (v === null) delete line[k];
    const lines = { ...mine.lines, [id]: line };
    if (!Object.keys(line).length) delete lines[id];
    save({ lines });
  };

  const typed = (c: BudgetCrop, k: keyof CropBudgetLine) => mine.lines[c.id]?.[k] !== undefined && mine.lines[c.id]?.[k] !== null;
  const Row = ({ c, k, label, value, unit }: { c: BudgetCrop; k: keyof CropBudgetLine; label: string; value: number | null; unit: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
      <span style={{ fontSize: 13 }}>{label}{typed(c, k) && <button className="btn-cancel" style={{ marginLeft: 6, padding: '1px 6px', fontSize: 11 }} onClick={() => setLine(c.id, k, null)}>reset</button>}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
        <NumBox value={value} label={`${c.label} ${label}`} onSave={v => setLine(c.id, k, v)} />{unit}
      </span>
    </div>
  );

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>Budget · harvest {HARVEST}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.6 }}>
          The 26/27 cropping plan, costed at what each crop really cost per hectare for harvest {b.lastHarvest} (from Crop margins).
          Yields and prices start at last harvest’s real figures. Change any figure to see what it does; your changes are saved.
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Cropped area</div><div className="metric-value">{b.own.areaHa.toFixed(0)} ha</div><div className="metric-sub">own crops{b.grange ? ', plus Grange' : ''}</div></div>
        <div className="metric-card"><div className="metric-label">Sales</div><div className="metric-value">{gbp(b.own.output)}</div><div className="metric-sub">own crops</div></div>
        <div className="metric-card"><div className="metric-label">Seed, fert, sprays</div><div className="metric-value">{gbp(b.own.direct)}</div><div className="metric-sub">{b.own.areaHa ? gbp(b.own.direct / b.own.areaHa) + '/ha' : ''}</div></div>
        <div className="metric-card"><div className="metric-label">Crop margin</div><div className="metric-value" style={{ color: colour(b.own.margin) }}>{gbp(b.own.margin)}</div><div className="metric-sub">{b.own.complete ? 'before overheads' : 'some crops have no yield or price'}</div></div>
      </div>

      {b.crops.length === 0 && <div className="card"><div className="empty">No 26/27 cropping plan yet. Fill it in under Fields &amp; crops → Cropping Plan.</div></div>}

      {b.crops.map(c => (
        <div key={c.id} className="card hub-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div className="card-title" style={{ margin: 0 }}>{c.label}</div>
              <div className="row-sub">{c.areaHa.toFixed(1)} ha · {c.fields.length} field{c.fields.length === 1 ? '' : 's'} · costs from {c.costSource}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Lora, serif', fontSize: 20, color: colour(c.marginPerHa) }}>{gbp(c.marginPerHa)}/ha</div>
              <div className="row-sub">{c.id === 'grange' ? 'whole-field margin, before the split' : gbp(c.margin) + ' total'}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', columnGap: 24, marginTop: 10 }}>
            <div>
              <Row c={c} k="yieldTha" label="Yield" value={c.yieldTha} unit="t/ha" />
              <div className="row-sub" style={{ marginTop: -2 }}>{c.yieldSource && `from ${c.yieldSource}`}</div>
              <Row c={c} k="price" label="Price" value={c.price} unit="£/t" />
              <div className="row-sub" style={{ marginTop: -2 }}>{c.priceSource && `from ${c.priceSource}`}</div>
            </div>
            <div>
              <Row c={c} k="seedPerHa" label="Seed" value={c.seedPerHa} unit="£/ha" />
              <Row c={c} k="fertPerHa" label="Fertiliser" value={c.fertPerHa} unit="£/ha" />
              <Row c={c} k="sprayPerHa" label="Sprays" value={c.sprayPerHa} unit="£/ha" />
            </div>
          </div>
          {c.planHint && <div className="row-sub" style={{ marginTop: 6 }}>{c.planHint}</div>}
          <div className="row-sub" style={{ marginTop: 8 }}>
            Sales {gbp(c.outputPerHa)}/ha − costs {gbp(c.directPerHa)}/ha{c.costPerT ? ` · costs ${gbp(c.costPerT)} per tonne grown` : ''}
          </div>
          <button className="btn-cancel" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide fields' : 'Show fields'}</button>
          {open === c.id && (
            <div style={{ marginTop: 6 }}>
              {c.fields.map(f => <div key={f.name} className="row-sub" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{f.name}</span><span>{f.areaHa.toFixed(2)} ha</span></div>)}
            </div>
          )}
        </div>
      ))}

      <div className="card hub-form">
        <div className="card-title">Whole farm</div>
        <div className="row-sub" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text)' }}><span>Own crops margin</span><span>{gbp(b.own.margin)}</span></div>
        {b.grange && <div className="row-sub" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text)' }}><span>Grange, our income (fee + half the surplus)</span><span>{gbp(b.grange.ourIncome)}</span></div>}
        <div className="row-sub" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text)' }}><span>Overheads (as entered in Crop margins)</span><span>{b.overheads ? '−' + gbp(b.overheads) : 'not entered yet'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ fontSize: 13 }}>Scheme income for {HARVEST}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>£<NumBox width={100} value={b.schemeIncome} label="Scheme income" onSave={v => save({ schemeIncome: v })} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
          <span>Net</span><span style={{ color: colour(b.net) }}>{gbp(b.net)}</span>
        </div>
        <div className="row-sub" style={{ marginTop: 6 }}>Scheme money: {b.schemeNote}. CS ends 31 Dec 2026 and SFI 1 on 31 Mar 2027; type your own figure once SFI26 is agreed.</div>
      </div>
    </>
  );
}
