'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FarmData, FieldYield, GrainSale, GrainSaleStatus, GrainMarketPrice, GrainQualityTest } from '@/lib/types';
import { uid } from '@/lib/utils';
import { computeMargins } from '@/lib/cropMargins';
import { grainSales, summarise, pricePerT, isPriced, isOurs, marketFor, OUR_SELLER } from '@/lib/grain';

// Money → Grain sales. The contracts (data.grainTrading.sales), set against
// what was actually harvested (yields via Crop margins), so it's clear how much
// is sold, at what price, and what is still to fix, collect or be paid for.

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const gbp = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined || !isFinite(n) ? '—' : '£' + n.toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: dp });
const t1 = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 }) + ' t';
const day = (d?: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
const todayIso = () => new Date().toISOString().slice(0, 10);

const STATUS: Record<GrainSaleStatus, { label: string; cls: string }> = {
  open: { label: 'Price to fix', cls: 'bg-amber' },
  priced: { label: 'Priced', cls: 'bg-blue' },
  delivered: { label: 'Delivered', cls: 'bg-blue' },
  invoiced: { label: 'Invoiced', cls: 'bg-blue' },
  paid: { label: 'Paid', cls: 'bg-green' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray' },
};

function moveWindow(s: GrainSale) {
  if (s.movementFrom && s.movementTo) {
    const a = new Date(s.movementFrom + 'T12:00:00'), b = new Date(s.movementTo + 'T12:00:00');
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return sameMonth ? a.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : `${day(s.movementFrom)} – ${day(s.movementTo)}`;
  }
  return day(s.movementFrom || s.movementTo) || '—';
}

/** Things to do about the contracts, most urgent first. */
function todo(sales: GrainSale[], today: string): { text: string; urgent: boolean }[] {
  const out: { text: string; urgent: boolean; sort: string }[] = [];
  for (const s of sales) {
    if (s.status === 'cancelled' || s.status === 'paid') continue;
    const name = `${s.contractNo ? '#' + s.contractNo : s.buyer} (${t1(s.quantityTonnes)}${s.seller && !isOurs(s) ? ', ' + s.seller : ''})`;
    if (!isPriced(s)) {
      out.push({ text: `Fix the base price on ${name} before it moves in ${moveWindow(s)}.`, urgent: !!s.movementFrom && s.movementFrom <= today, sort: s.movementFrom ?? '9' });
    } else if ((s.status === 'priced' || s.status === 'open') && s.movementTo && s.movementTo < today && !(s.deliveredTonnes)) {
      out.push({ text: `${name}: movement window ended ${day(s.movementTo)} and nothing collected yet. Chase ${s.buyer || 'the buyer'} for a collection date.`, urgent: true, sort: s.movementTo });
    } else if (s.status === 'invoiced' && s.paymentDueDate) {
      out.push({ text: `${name}: ${gbp(s.invoiceNetPayable)} due ${day(s.paymentDueDate)}${s.paymentDueDate < today ? ' (overdue)' : ''}.`, urgent: s.paymentDueDate < today, sort: s.paymentDueDate });
    }
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.sort.localeCompare(b.sort));
}

// ── Contract form ────────────────────────────────────────────────────────────
function SaleModal({ existing, harvest, onSave, onRemove, onClose }: { existing?: GrainSale; harvest: string; onSave: (s: GrainSale) => void; onRemove?: () => void; onClose: () => void }) {
  const [f, setF] = useState<GrainSale>(existing ?? {
    id: uid(), harvest, crop: 'Group 1 Milling Wheat', buyer: 'Heygate Grain Ltd', seller: OUR_SELLER,
    quantityTonnes: 0, premiumPerTonne: 0, basePricePerTonne: null, status: 'open',
  });
  const set = (p: Partial<GrainSale>) => setF(x => ({ ...x, ...p }));
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  function save() {
    if (!f.quantityTonnes) return alert('Tonnes needed');
    const priced = !!f.basePricePerTonne;
    const status = f.status === 'open' && priced ? 'priced' : f.status === 'priced' && !priced ? 'open' : f.status;
    onSave({ ...f, status });
  }
  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-title">{existing ? 'Edit contract' : 'Add contract'}</div>
        <div className="field-row">
          <div><label className="form-label">Contract no.</label><input value={f.contractNo ?? ''} onChange={e => set({ contractNo: e.target.value })} /></div>
          <div><label className="form-label">Harvest</label><input value={f.harvest} onChange={e => set({ harvest: e.target.value })} /></div>
        </div>
        <label className="form-label">Crop</label><input value={f.crop} onChange={e => set({ crop: e.target.value })} />
        <div className="field-row">
          <div><label className="form-label">Buyer</label><input value={f.buyer} onChange={e => set({ buyer: e.target.value })} /></div>
          <div><label className="form-label">In the name of</label><input value={f.seller ?? ''} onChange={e => set({ seller: e.target.value })} /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Tonnes</label><input type="number" inputMode="decimal" value={f.quantityTonnes || ''} onChange={e => set({ quantityTonnes: n(e.target.value) ?? 0 })} /></div>
          <div><label className="form-label">Delivered tonnes</label><input type="number" inputMode="decimal" value={f.deliveredTonnes ?? ''} onChange={e => set({ deliveredTonnes: n(e.target.value) })} /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Base £/t (blank = not fixed)</label><input type="number" inputMode="decimal" value={f.basePricePerTonne ?? ''} onChange={e => set({ basePricePerTonne: n(e.target.value) ?? null })} /></div>
          <div><label className="form-label">Premium £/t</label><input type="number" inputMode="decimal" value={f.premiumPerTonne ?? ''} onChange={e => set({ premiumPerTonne: n(e.target.value) ?? 0 })} /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Moves from</label><input type="date" value={f.movementFrom ?? ''} onChange={e => set({ movementFrom: e.target.value || undefined })} /></div>
          <div><label className="form-label">Moves by</label><input type="date" value={f.movementTo ?? ''} onChange={e => set({ movementTo: e.target.value || undefined })} /></div>
        </div>
        <div className="field-row">
          <div>
            <label className="form-label">Status</label>
            <select value={f.status} onChange={e => set({ status: e.target.value as GrainSaleStatus })}>
              {(Object.keys(STATUS) as GrainSaleStatus[]).map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}
            </select>
          </div>
          <div><label className="form-label">Contract date</label><input type="date" value={f.contractDate ?? ''} onChange={e => set({ contractDate: e.target.value || undefined })} /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Invoice no.</label><input value={f.invoiceNo ?? ''} onChange={e => set({ invoiceNo: e.target.value || undefined })} /></div>
          <div><label className="form-label">Net payable £</label><input type="number" inputMode="decimal" value={f.invoiceNetPayable ?? ''} onChange={e => set({ invoiceNetPayable: n(e.target.value) })} /></div>
        </div>
        <label className="form-label">Payment due</label><input type="date" value={f.paymentDueDate ?? ''} onChange={e => set({ paymentDueDate: e.target.value || undefined })} />
        <label className="form-label">Notes</label><textarea value={f.notes ?? ''} onChange={e => set({ notes: e.target.value })} />
        <div className="modal-btns">
          {onRemove && <button className="btn-add danger" style={{ marginRight: 'auto' }} onClick={onRemove}>Remove</button>}
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

function QualityModal({ existing, onSave, onClose }: { existing?: GrainQualityTest; onSave: (t: GrainQualityTest) => void; onClose: () => void }) {
  const [f, setF] = useState<GrainQualityTest>(existing ?? { id: uid(), dateTested: todayIso() });
  const set = (p: Partial<GrainQualityTest>) => setF(x => ({ ...x, ...p }));
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const numField = (label: string, k: 'moisture' | 'protein' | 'hagberg' | 'screenings' | 'specificWeight' | 'don' | 'zon') => (
    <div><label className="form-label">{label}</label><input type="number" inputMode="decimal" step="0.1" value={f[k] ?? ''} onChange={e => set({ [k]: n(e.target.value) })} /></div>
  );
  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-title">{existing ? 'Edit' : 'Add'} quality sample</div>
        <div className="field-row">
          <div><label className="form-label">Date tested</label><input type="date" value={f.dateTested} onChange={e => set({ dateTested: e.target.value })} /></div>
          <div><label className="form-label">Variety</label><input value={f.variety ?? ''} onChange={e => set({ variety: e.target.value || undefined })} placeholder="e.g. Skyfall" /></div>
        </div>
        <div className="field-row">
          <div><label className="form-label">Location / bay</label><input value={f.location ?? ''} onChange={e => set({ location: e.target.value || undefined })} /></div>
          <div><label className="form-label">Lab</label><input value={f.lab ?? ''} onChange={e => set({ lab: e.target.value || undefined })} /></div>
        </div>
        <div className="field-row">{numField('Moisture %', 'moisture')}{numField('Protein %', 'protein')}</div>
        <div className="field-row">{numField('Hagberg', 'hagberg')}{numField('Screenings %', 'screenings')}</div>
        <div className="field-row">{numField('Specific weight', 'specificWeight')}{numField('DON', 'don')}</div>
        <label className="form-label">Notes</label><textarea value={f.notes ?? ''} onChange={e => set({ notes: e.target.value || undefined })} />
        <div className="modal-btns">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => f.dateTested && onSave(f)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function GrainTrading({ db, persist, addActivity }: Props) {
  const [yields, setYields] = useState<FieldYield[]>([]);
  const [editing, setEditing] = useState<GrainSale | 'new' | null>(null);
  const [quality, setQuality] = useState<GrainQualityTest | 'new' | null>(null);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [priceEdits, setPriceEdits] = useState<GrainMarketPrice[]>([]);

  useEffect(() => { fetch('/api/yields').then(r => (r.ok ? r.json() : [])).then(setYields).catch(() => {}); }, []);

  const g = db.grainTrading ?? {};
  const allSales = useMemo(() => grainSales(db), [db]);
  const harvests = Array.from(new Set(['2026', '2027', ...allSales.map(s => s.harvest)])).sort();
  const [harvest, setHarvest] = useState('2026');
  const sales = allSales.filter(s => s.harvest === harvest);
  const market = g.marketPrices ?? [];
  const today = todayIso();

  // What was grown, from the same records as Crop margins (only harvest 2026 so far).
  const margins = useMemo(() => (harvest === '2026' ? computeMargins(db, yields, harvest) : null), [db, yields, harvest]);
  const grown = (id: string) => margins?.groups.find(x => x.id === id)?.tonnes ?? 0;
  const wheatGrown = grown('milling') + grown('wildfarmed');
  const kept = g.keptBack?.[harvest] ?? 0;

  const ours = sales.filter(isOurs);
  // Fawley House Farm is the Grange land (Knowles contract farming), sold in its own name.
  const isGrange = (s: GrainSale) => /fawley/i.test(s.seller ?? '');
  const grange = sales.filter(s => !isOurs(s) && isGrange(s));
  const others = sales.filter(s => !isOurs(s) && !isGrange(s));
  const sumGrange = summarise(grange, market);
  const grangeGrown = grown('grange');
  const sumOurs = summarise(ours, market);
  const left = wheatGrown - kept - sumOurs.tonnes;
  const jobs = todo(sales, today);

  const saveSales = (next: GrainSale[], msg: string) => {
    const rest = allSales.filter(s => s.harvest !== harvest);
    persist({ ...db, grainTrading: { ...g, sales: [...rest, ...next], positions: undefined } });
    addActivity(msg);
  };
  const saveSale = (s: GrainSale) => {
    const exists = sales.some(x => x.id === s.id);
    const moved = s.harvest !== harvest;
    const nextAll = exists ? allSales.map(x => (x.id === s.id ? s : x)) : [...allSales, s];
    persist({ ...db, grainTrading: { ...g, sales: nextAll, positions: undefined } });
    addActivity(`Grain contract ${exists ? 'updated' : 'added'}: ${s.contractNo ?? ''} ${t1(s.quantityTonnes)} to ${s.buyer}`);
    setEditing(null);
    if (moved) setHarvest(s.harvest);
  };
  const removeSale = (s: GrainSale) => {
    if (!confirm(`Remove contract ${s.contractNo ?? ''}?`)) return;
    saveSales(sales.filter(x => x.id !== s.id), `Grain contract removed: ${s.contractNo ?? s.buyer}`);
    setEditing(null);
  };
  const setKept = (v: number) => persist({ ...db, grainTrading: { ...g, sales: allSales, positions: undefined, keptBack: { ...g.keptBack, [harvest]: v } } });

  const tests = [...(db.grainQualityTests ?? [])].sort((a, b) => (b.dateTested || '').localeCompare(a.dateTested || ''));
  const saveTest = (t: GrainQualityTest) => {
    const list = db.grainQualityTests ?? [];
    persist({ ...db, grainQualityTests: list.some(x => x.id === t.id) ? list.map(x => (x.id === t.id ? t : x)) : [...list, t] });
    setQuality(null);
  };

  const SaleCard = ({ s }: { s: GrainSale }) => {
    const p = pricePerT(s);
    const m = p === null ? marketFor(s, market) : null;
    const t = s.deliveredTonnes && ['delivered', 'invoiced', 'paid'].includes(s.status) ? s.deliveredTonnes : s.quantityTonnes;
    return (
      <div className="row-item" style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setEditing(s)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-name">
            {s.contractNo ? `#${s.contractNo} · ` : ''}{t1(t)} · {p !== null ? `£${p.toFixed(2)}/t` : `base to fix + £${s.premiumPerTonne ?? 0}`}
          </div>
          <div className="row-sub">
            {s.crop} to {s.buyer} · moves {moveWindow(s)}
            {p !== null ? ` · ${gbp(t * p)}` : m ? ` · about ${gbp(t * (m.pricePerTonne + (s.premiumPerTonne ?? 0)))} at today’s ${m.contract} price` : ''}
          </div>
          {s.invoiceNo && <div className="row-sub">Invoice {s.invoiceNo}{s.invoiceNetPayable ? `, net ${gbp(s.invoiceNetPayable, 2)}` : ''}{s.paymentDueDate ? `, due ${day(s.paymentDueDate)}` : ''}</div>}
        </div>
        <span className={`badge ${STATUS[s.status].cls}`} style={{ whiteSpace: 'nowrap' }}>{STATUS[s.status].label}</span>
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>Grain sales · harvest {harvest}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Your contracts set against what was actually harvested. Tap a contract to change it.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={harvest} onChange={e => setHarvest(e.target.value)} style={{ padding: '7px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14 }}>
            {harvests.map(h => <option key={h} value={h}>Harvest {h}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Contract</button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Wheat harvested</div>
          <div className="metric-value">{margins ? t1(Math.round(wheatGrown)) : '—'}</div>
          <div className="metric-sub">{margins ? `${t1(Math.round(grown('milling')))} winter · ${t1(Math.round(grown('wildfarmed')))} spring` : 'Yields not in yet'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Sold</div>
          <div className="metric-value">{t1(Math.round(sumOurs.tonnes))}</div>
          <div className="metric-sub">{t1(Math.round(sumOurs.fixedTonnes))} priced · {t1(Math.round(sumOurs.floatingTonnes))} price to fix</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Left to sell</div>
          <div className="metric-value" style={{ color: left < 0 ? 'var(--red)' : undefined }}>{margins ? t1(Math.round(left)) : '—'}</div>
          <div className="metric-sub">{left < 0 ? 'More sold than harvested: check' : kept ? `after ${t1(kept)} kept back` : 'nothing kept back yet'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Average price</div>
          <div className="metric-value">{sumOurs.avgAll ? `£${sumOurs.avgAll.toFixed(0)}` : '—'}</div>
          <div className="metric-sub">{sumOurs.avgFixed ? `£${sumOurs.avgFixed.toFixed(0)}/t on the priced tonnes${sumOurs.floatingTonnes ? '; rest at today’s market' : ''}` : 'per tonne'}</div>
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="card">
          <div className="card-title">To do</div>
          {jobs.map((j, i) => (
            <div key={i} className="row-item"><span className={`dot ${j.urgent ? 'dot-red' : 'dot-amber'}`} /><div className="row-sub" style={{ color: 'var(--text)', fontSize: 13 }}>{j.text}</div></div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-title">{OUR_SELLER} contracts</div>
        {ours.length === 0 && <div className="empty">No contracts for harvest {harvest} yet.</div>}
        {ours.map(s => <SaleCard key={s.id} s={s} />)}
        {ours.length > 0 && (
          <div className="row-sub" style={{ marginTop: 8 }}>
            Priced so far: {gbp(sumOurs.fixedValue)} on {t1(Math.round(sumOurs.fixedTonnes))}
            {sumOurs.floatingTonnes ? `. Unpriced tonnes would be about ${gbp(sumOurs.estFloatingValue)} at today’s market plus premium.` : '.'}
          </div>
        )}
        <div className="hub-form" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <label className="form-label" style={{ margin: 0 }}>Wheat kept back (cattle feed, seed, shoot), tonnes</label>
          <input type="number" inputMode="decimal" defaultValue={kept || ''} key={harvest + kept} style={{ width: 100, marginBottom: 0 }}
            onBlur={e => { const v = Number(e.target.value) || 0; if (v !== kept) setKept(v); }} />
        </div>
      </div>

      {(grange.length > 0 || grangeGrown > 0) && (
        <div className="card">
          <div className="card-title">Grange (sold as Fawley House Farm)</div>
          <div className="row-sub" style={{ marginBottom: 6 }}>
            {margins ? `${t1(Math.round(grangeGrown))} harvested · ` : ''}{t1(Math.round(sumGrange.tonnes))} sold
            {margins ? ` · ${t1(Math.round(grangeGrown - sumGrange.tonnes))} left to sell` : ''}
            {sumGrange.avgAll ? ` · average £${sumGrange.avgAll.toFixed(0)}/t${sumGrange.floatingTonnes ? ' (unpriced at today’s market)' : ''}` : ''}.
            The surplus is shared 50/50 with Knowles (see Crop margins), so these aren’t counted in your own tonnes above.
          </div>
          {grange.map(s => <SaleCard key={s.id} s={s} />)}
        </div>
      )}

      {others.length > 0 && (
        <div className="card">
          <div className="card-title">Contracts in other names</div>
          <div className="row-sub" style={{ marginBottom: 6 }}>Not counted in your sold tonnes above.</div>
          {Array.from(new Set(others.map(s => s.seller ?? ''))).map(seller => {
            const list = others.filter(s => (s.seller ?? '') === seller);
            const sm = summarise(list, market);
            return (
              <div key={seller} style={{ marginBottom: 8 }}>
                <div className="row-sub" style={{ fontWeight: 600, color: 'var(--text)' }}>{seller}: {t1(sm.tonnes)}{sm.avgFixed ? `, priced at £${sm.avgFixed.toFixed(0)}/t` : ''}</div>
                {list.map(s => <SaleCard key={s.id} s={s} />)}
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Market prices</div>
          <button className="btn-add" onClick={() => { setPriceEdits(market.length ? market : [{ contract: 'Nov-26', pricePerTonne: 0, fetchedAt: '' }]); setPricesOpen(true); }}>Update</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {market.length === 0 && <div className="empty">No prices yet.</div>}
          {market.map(m => (
            <div key={m.contract} className="metric-card" style={{ padding: '.6rem .9rem' }}>
              <div className="metric-label">{m.contract}</div>
              <div style={{ fontSize: 18, fontFamily: 'Lora, serif', color: 'var(--green)' }}>£{m.pricePerTonne.toFixed(2)}</div>
            </div>
          ))}
        </div>
        {g.lastMarketFetch && <div className="row-sub" style={{ marginTop: 6 }}>{market[0]?.source ? market[0].source + ', ' : ''}updated {day(g.lastMarketFetch.slice(0, 10))}. Used only to estimate unpriced contracts.</div>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Quality samples</div>
          <button className="btn-add" onClick={() => setQuality('new')}>+ Sample</button>
        </div>
        {tests.length === 0 && <div className="empty">No samples logged.</div>}
        {tests.map(q => (
          <div key={q.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setQuality(q)}>
            <div style={{ flex: 1 }}>
              <div className="row-name">{day(q.dateTested)} · {q.variety || 'Sample'}{q.location ? ` · ${q.location}` : ''}</div>
              <div className="row-sub">
                {[q.protein !== undefined && `Protein ${q.protein}%`, q.moisture !== undefined && `MC ${q.moisture}%`, q.hagberg !== undefined && `HFN ${q.hagberg}`,
                  q.specificWeight !== undefined && `SW ${q.specificWeight}`, q.screenings !== undefined && `Scr ${q.screenings}%`].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <SaleModal existing={editing === 'new' ? undefined : editing} harvest={harvest} onSave={saveSale}
          onRemove={editing === 'new' ? undefined : () => removeSale(editing)} onClose={() => setEditing(null)} />
      )}
      {quality && <QualityModal existing={quality === 'new' ? undefined : quality} onSave={saveTest} onClose={() => setQuality(null)} />}

      {pricesOpen && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setPricesOpen(false)}>
          <div className="modal-box">
            <div className="modal-title">Market prices (£/t)</div>
            {priceEdits.map((p, i) => (
              <div key={i} className="field-row">
                <input value={p.contract} onChange={e => setPriceEdits(a => a.map((x, j) => (j === i ? { ...x, contract: e.target.value } : x)))} placeholder="e.g. May-27" />
                <input type="number" inputMode="decimal" value={p.pricePerTonne || ''} onChange={e => setPriceEdits(a => a.map((x, j) => (j === i ? { ...x, pricePerTonne: Number(e.target.value) } : x)))} />
              </div>
            ))}
            <button className="btn-add" onClick={() => setPriceEdits(a => [...a, { contract: '', pricePerTonne: 0, fetchedAt: '' }])}>+ Another month</button>
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setPricesOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => {
                const now = new Date().toISOString();
                persist({ ...db, grainTrading: { ...g, sales: allSales, positions: undefined, marketPrices: priceEdits.filter(p => p.contract && p.pricePerTonne > 0).map(p => ({ ...p, fetchedAt: now, source: 'Typed in' })), lastMarketFetch: now } });
                setPricesOpen(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
