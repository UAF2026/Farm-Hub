'use client';

import { useState, useMemo } from 'react';
import { FarmData, GrainContract, GrainContractStatus, GrainContractType, GrainCropYear, GrainMarketPrice, GrainPosition } from '@/lib/types';
import { uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtT = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 't';
const fmtPpt = (n: number) => '£' + n.toFixed(2) + '/t';

const CROP_YEARS: GrainCropYear[] = ['2024/25', '2025/26', '2026/27', '2027/28'];
const BUYERS = ['Heygates', 'Openfield', 'Cofco', 'ADM', 'Frontier', 'Gleadell', 'Glencore', 'Other'];
const CONTRACT_TYPES: GrainContractType[] = ['spot', 'forward', 'pool', 'tender'];
const CROPS = ['Feed Wheat', 'Milling Wheat', 'Winter Wheat'];

// Crop year guide (for reference in advice logic):
//   2024/25 = OLD CROP — drilled autumn 2024, harvested Aug 2025. 300t in store now.
//   2025/26 = NEW CROP — drilled autumn 2025 / spring 2026, harvesting Jul/Aug 2026.
//   2026/27 = NEXT CROP — to be drilled autumn 2026. Planning decisions happening now.

// ICE UK feed wheat futures — updated manually or by briefing
// These are the reference prices shown to the user. In future the daily briefing
// can push fresh prices into db.grainTrading.marketPrices.
const FALLBACK_FUTURES: GrainMarketPrice[] = [
  { contract: 'May-26 (old crop)',  pricePerTonne: 189.00, fetchedAt: '', source: 'ICE UK' },
  { contract: 'Jul-26 (harvest)',   pricePerTonne: 184.15, fetchedAt: '', source: 'ICE UK' },
  { contract: 'Nov-26 (new crop)',  pricePerTonne: 191.55, fetchedAt: '', source: 'ICE UK' },
  { contract: 'Jan-27',             pricePerTonne: 192.40, fetchedAt: '', source: 'ICE UK' },
  { contract: 'Mar-27',             pricePerTonne: 195.55, fetchedAt: '', source: 'ICE UK' },
];

// Seed data — 300t old crop (2024/25) in store from harvest August 2025
const SEED_POSITION: GrainPosition = {
  cropYear: '2024/25',
  crop: 'Feed Wheat',
  estimatedTotalTonnes: 300,
  contracts: [],
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function statusColor(s: GrainContractStatus): string {
  if (s === 'paid') return 'var(--color-success)';
  if (s === 'delivered' || s === 'invoiced') return 'var(--color-primary)';
  if (s === 'cancelled') return 'var(--color-muted)';
  return 'var(--color-warning)';
}

// ── Intelligence: generate advice based on position vs market ─────────────
// Crop year context:
//   2024/25 = old crop in store — harvest was Aug 2025. Sell before new crop arrives Jul/Aug 2026.
//   2025/26 = new crop in ground now — harvesting Jul/Aug 2026. Forward sell carefully given yield uncertainty.
//   2026/27 = next crop — drilled autumn 2026. Too early to sell forward.
function generateAdvice(position: GrainPosition, market: GrainMarketPrice[]): { signal: 'sell' | 'hold' | 'watch'; title: string; body: string; colour: string } {
  const activeContracts = position.contracts.filter(c => c.status !== 'cancelled');
  const totalSold = activeContracts.reduce((a, c) => a + c.tonnes, 0);
  const unsold = Math.max(0, position.estimatedTotalTonnes - totalSold);
  const pctSold = position.estimatedTotalTonnes > 0 ? (totalSold / position.estimatedTotalTonnes) * 100 : 0;
  const avgSoldPrice = totalSold > 0
    ? activeContracts.reduce((a, c) => a + c.pricePerTonne * c.tonnes, 0) / totalSold
    : 0;

  const spotPrice   = market.find(m => m.contract.toLowerCase().includes('may-26') || m.contract.toLowerCase().includes('old crop'))?.pricePerTonne ?? 189;
  const harvestPrice = market.find(m => m.contract.toLowerCase().includes('jul'))?.pricePerTonne ?? 184;
  const newCropPrice = market.find(m => m.contract.toLowerCase().includes('nov-26') || m.contract.toLowerCase().includes('new crop'))?.pricePerTonne ?? 191;
  const weeksToHarvest = Math.round((new Date('2026-08-01').getTime() - Date.now()) / (7 * 86400000));

  if (unsold <= 0) {
    return { signal: 'hold', title: 'Fully sold', body: 'All estimated tonnes are contracted. Review the estimated total if actual yield differs.', colour: 'var(--color-success)' };
  }

  // ── OLD CROP (2024/25): 300t in store from harvest Aug 2025 ──
  if (position.cropYear === '2024/25') {
    const carry = harvestPrice - spotPrice; // usually negative — market falls into harvest
    const urgency = weeksToHarvest < 12;
    if (pctSold < 30) {
      return {
        signal: 'sell',
        title: `Old crop: only ${pctSold.toFixed(0)}% sold — harvest pressure arriving in ~${weeksToHarvest} weeks`,
        body: `You have ~${fmtT(unsold)} unsold (old crop, harvested Aug 2025). Old crop spot is ${fmtPpt(spotPrice)}. Jul-26 harvest futures are ${fmtPpt(harvestPrice)} — the market typically falls ${carry < 0 ? `£${Math.abs(carry).toFixed(2)}/t` : 'further'} as new crop arrives. Sell a meaningful tranche now to avoid being a forced seller at harvest. Total unsold value at spot: ~${fmtMoney(unsold * spotPrice)}.`,
        colour: 'var(--color-danger)',
      };
    }
    if (pctSold < 70) {
      return {
        signal: urgency ? 'sell' : 'watch',
        title: `Old crop: ${pctSold.toFixed(0)}% sold — ${urgency ? 'harvest approaching, act now' : 'monitor and sell into strength'}`,
        body: `~${fmtT(unsold)} old crop still unsold at ~${fmtMoney(unsold * spotPrice)}. ${urgency ? `Harvest is ~${weeksToHarvest} weeks away — old crop premium over new crop will compress. ` : ''}Jul-26 at ${fmtPpt(harvestPrice)} vs spot ${fmtPpt(spotPrice)} — the carry is ${carry >= 0 ? `positive at £${carry.toFixed(2)}/t` : `negative at -£${Math.abs(carry).toFixed(2)}/t, meaning storage is not being rewarded`}. Consider selling in tranches to average the price.`,
        colour: urgency ? 'var(--color-danger)' : 'var(--color-warning)',
      };
    }
    return {
      signal: 'hold',
      title: `Old crop: ${pctSold.toFixed(0)}% sold — tail position, hold or sell on strength`,
      body: `Only ~${fmtT(unsold)} unsold. ${avgSoldPrice > 0 ? `Average sold price: ${fmtPpt(avgSoldPrice)} vs current spot ${fmtPpt(spotPrice)}. ` : ''}Small tail can be held for optionality but sell before harvest to avoid storage congestion. Watch for any weather-driven price spikes in the next few weeks.`,
      colour: 'var(--color-success)',
    };
  }

  // ── NEW CROP (2025/26): in the ground now, harvest Jul/Aug 2026 ──
  if (position.cropYear === '2025/26') {
    const yieldRisk = true; // dry weather / chalk soils — flag this always for 2025/26
    if (pctSold === 0) {
      return {
        signal: 'watch',
        title: `New crop: nothing sold forward yet — consider a cautious first tranche`,
        body: `New crop (harvest Jul/Aug 2026) at ${fmtPpt(newCropPrice)} Nov-26. Given the dry weather and yield uncertainty on your chalk soils, avoid selling aggressively forward until harvest prospects are clearer. A first tranche of 20-30% of estimated yield at current prices is reasonable to lock in some certainty. Estimated total: ${fmtT(position.estimatedTotalTonnes)}.`,
        colour: 'var(--color-warning)',
      };
    }
    if (pctSold < 50) {
      return {
        signal: 'watch',
        title: `New crop: ${pctSold.toFixed(0)}% sold — yield uncertainty, go carefully`,
        body: `~${fmtT(totalSold)} sold forward at avg ${fmtPpt(avgSoldPrice)}. With dry conditions on your free-draining soils, be cautious committing more until the crop is closer to harvest and yield is clearer. Overselling against a reduced crop is a real risk. Watch the Nov-26 futures for any weather-driven upside before harvest.`,
        colour: 'var(--color-warning)',
      };
    }
    return {
      signal: 'hold',
      title: `New crop: ${pctSold.toFixed(0)}% sold — well covered, hold the rest for harvest`,
      body: `Most new crop tonnes are contracted at avg ${fmtPpt(avgSoldPrice)}. Hold the remainder until actual yield is known at harvest. Don't sell the tail forward in case of a yield shortfall — you'll need physical grain to back any forward contracts.`,
      colour: 'var(--color-success)',
    };
  }

  // ── NEXT CROP (2026/27): too early for most forward selling ──
  if (position.cropYear === '2026/27') {
    return {
      signal: 'watch',
      title: `Harvest 27: too early to sell — plan the crop first`,
      body: `Focus on rotation and variety decisions for autumn 2026 drilling before committing to forward sales. Mar-27 futures at ${fmtPpt(market.find(m => m.contract.includes('Mar-27'))?.pricePerTonne ?? 195)} give a reference point. Revisit forward selling once the crop is in the ground.`,
      colour: 'var(--color-muted)',
    };
  }

  // Generic fallback
  return {
    signal: 'watch',
    title: `${pctSold.toFixed(0)}% sold`,
    body: `~${fmtT(unsold)} unsold at ~${fmtMoney(unsold * spotPrice)}. Review position against current market prices.`,
    colour: 'var(--color-warning)',
  };
}

// ── Modal: add/edit contract ──────────────────────────────────────────────────
interface ContractModalProps {
  cropYear: GrainCropYear;
  existing?: GrainContract;
  onSave: (c: GrainContract) => void;
  onClose: () => void;
}
function ContractModal({ cropYear, existing, onSave, onClose }: ContractModalProps) {
  const [crop, setCrop] = useState(existing?.crop ?? 'Feed Wheat');
  const [buyer, setBuyer] = useState(existing?.buyer ?? 'Heygates');
  const [customBuyer, setCustomBuyer] = useState('');
  const [contractType, setContractType] = useState<GrainContractType>(existing?.contractType ?? 'spot');
  const [tonnes, setTonnes] = useState(String(existing?.tonnes ?? ''));
  const [price, setPrice] = useState(String(existing?.pricePerTonne ?? ''));
  const [basis, setBasis] = useState(existing?.basis ?? 'ex-farm');
  const [ref, setRef] = useState(existing?.contractRef ?? '');
  const [contractDate, setContractDate] = useState(existing?.contractDate ?? '');
  const [deliveryFrom, setDeliveryFrom] = useState(existing?.deliveryFrom ?? '');
  const [deliveryTo, setDeliveryTo] = useState(existing?.deliveryTo ?? '');
  const [status, setStatus] = useState<GrainContractStatus>(existing?.status ?? 'open');
  const [deliveredTonnes, setDeliveredTonnes] = useState(String(existing?.deliveredTonnes ?? ''));
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const effectiveBuyer = buyer === 'Other' ? customBuyer : buyer;

  function save() {
    const t = parseFloat(tonnes);
    const p = parseFloat(price);
    if (!effectiveBuyer || isNaN(t) || isNaN(p) || t <= 0 || p <= 0) return;
    onSave({
      id: existing?.id ?? uid(),
      cropYear,
      crop,
      buyer: effectiveBuyer,
      contractType,
      tonnes: t,
      pricePerTonne: p,
      basis,
      contractRef: ref || undefined,
      contractDate: contractDate || undefined,
      deliveryFrom: deliveryFrom || undefined,
      deliveryTo: deliveryTo || undefined,
      deliveredTonnes: deliveredTonnes ? parseFloat(deliveredTonnes) : undefined,
      status,
      notes: notes || undefined,
    });
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 };
  const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--color-muted)', marginBottom: 3 };
  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--color-card)', borderRadius: 12, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{existing ? 'Edit Contract' : 'Add Contract'} — {cropYear}</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={row}>
            <div><div style={lbl}>Crop</div>
              <select value={crop} onChange={e => setCrop(e.target.value)} style={inp}>
                {CROPS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Type</div>
              <select value={contractType} onChange={e => setContractType(e.target.value as GrainContractType)} style={inp}>
                {CONTRACT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={row}>
            <div><div style={lbl}>Buyer</div>
              <select value={buyer} onChange={e => setBuyer(e.target.value)} style={inp}>
                {BUYERS.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            {buyer === 'Other' && (
              <div><div style={lbl}>Buyer name</div>
                <input value={customBuyer} onChange={e => setCustomBuyer(e.target.value)} style={inp} placeholder="e.g. Glencore" />
              </div>
            )}
          </div>

          <div style={row}>
            <div><div style={lbl}>Tonnes</div>
              <input type="number" value={tonnes} onChange={e => setTonnes(e.target.value)} style={inp} placeholder="e.g. 300" />
            </div>
            <div><div style={lbl}>Price (£/t)</div>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={inp} placeholder="e.g. 189.00" step="0.25" />
            </div>
          </div>

          <div style={row}>
            <div><div style={lbl}>Basis</div>
              <select value={basis} onChange={e => setBasis(e.target.value)} style={inp}>
                <option>ex-farm</option><option>delivered</option><option>franco</option>
              </select>
            </div>
            <div><div style={lbl}>Contract ref</div>
              <input value={ref} onChange={e => setRef(e.target.value)} style={inp} placeholder="optional" />
            </div>
          </div>

          <div style={row}>
            <div><div style={lbl}>Contract date</div>
              <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} style={inp} />
            </div>
            <div><div style={lbl}>Status</div>
              <select value={status} onChange={e => setStatus(e.target.value as GrainContractStatus)} style={inp}>
                <option value="open">Open</option>
                <option value="delivered">Delivered</option>
                <option value="invoiced">Invoiced</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div style={row}>
            <div><div style={lbl}>Delivery from</div>
              <input type="date" value={deliveryFrom} onChange={e => setDeliveryFrom(e.target.value)} style={inp} />
            </div>
            <div><div style={lbl}>Delivery to</div>
              <input type="date" value={deliveryTo} onChange={e => setDeliveryTo(e.target.value)} style={inp} />
            </div>
          </div>

          <div><div style={lbl}>Tonnes delivered so far</div>
            <input type="number" value={deliveredTonnes} onChange={e => setDeliveredTonnes(e.target.value)} style={inp} placeholder="leave blank if not yet delivered" />
          </div>

          <div><div style={lbl}>Notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inp, height: 60, resize: 'vertical' }} placeholder="e.g. milling spec, haulage arrranged..." />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save contract</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GrainTrading({ db, persist, addActivity }: Props) {
  const grainData = db.grainTrading ?? { positions: [SEED_POSITION] };
  const [selectedYear, setSelectedYear] = useState<GrainCropYear>('2024/25');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editingContract, setEditingContract] = useState<GrainContract | undefined>();
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [newEstimate, setNewEstimate] = useState('');
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceEdits, setPriceEdits] = useState<GrainMarketPrice[]>([]);

  const market: GrainMarketPrice[] = grainData.marketPrices?.length ? grainData.marketPrices : FALLBACK_FUTURES;
  const lastFetch = grainData.lastMarketFetch;

  // Get or create position for selected year
  const position: GrainPosition = useMemo(() => {
    return grainData.positions.find(p => p.cropYear === selectedYear) ?? {
      cropYear: selectedYear,
      crop: 'Winter Wheat',
      estimatedTotalTonnes: 0,
      contracts: [],
    };
  }, [grainData, selectedYear]);

  function savePosition(updated: GrainPosition) {
    const positions = grainData.positions.filter(p => p.cropYear !== selectedYear);
    persist({ ...db, grainTrading: { ...grainData, positions: [...positions, updated] } });
  }

  // ── Derived stats ──
  const activeContracts = position.contracts.filter(c => c.status !== 'cancelled');
  const totalSold = activeContracts.reduce((a, c) => a + c.tonnes, 0);
  const totalValue = activeContracts.reduce((a, c) => a + c.pricePerTonne * c.tonnes, 0);
  const avgPrice = totalSold > 0 ? totalValue / totalSold : 0;
  const unsold = Math.max(0, position.estimatedTotalTonnes - totalSold);
  const pctSold = position.estimatedTotalTonnes > 0 ? (totalSold / position.estimatedTotalTonnes) * 100 : 0;
  const spotRef = market.find(m => m.contract.includes('May-26') || m.contract.toLowerCase().includes('old crop'))?.pricePerTonne ?? 189;
  const unsoldValue = unsold * spotRef;

  const advice = useMemo(() => generateAdvice(position, market), [position, market]);

  // ── Handlers ──
  function addContract(c: GrainContract) {
    const updated = { ...position, contracts: [...position.contracts, c] };
    savePosition(updated);
    addActivity(`Grain contract added: ${c.tonnes}t @ ${fmtPpt(c.pricePerTonne)} to ${c.buyer}`);
    setModal(null);
  }

  function updateContract(c: GrainContract) {
    const updated = { ...position, contracts: position.contracts.map(x => x.id === c.id ? c : x) };
    savePosition(updated);
    addActivity(`Grain contract updated: ${c.tonnes}t @ ${fmtPpt(c.pricePerTonne)} to ${c.buyer}`);
    setModal(null);
    setEditingContract(undefined);
  }

  function deleteContract(id: string) {
    if (!confirm('Remove this contract?')) return;
    const updated = { ...position, contracts: position.contracts.filter(c => c.id !== id) };
    savePosition(updated);
  }

  function saveEstimate() {
    const n = parseFloat(newEstimate);
    if (isNaN(n) || n < 0) return;
    savePosition({ ...position, estimatedTotalTonnes: n });
    setEditingEstimate(false);
  }

  function savePrices() {
    persist({ ...db, grainTrading: { ...grainData, marketPrices: priceEdits, lastMarketFetch: new Date().toISOString() } });
    setPriceModalOpen(false);
  }

  // ── Render ──
  const cardStyle: React.CSSProperties = { background: 'var(--color-card)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--color-border)' };
  const kpiStyle: React.CSSProperties = { ...cardStyle, textAlign: 'center' };

  return (
    <div className="section-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Grain Trading</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value as GrainCropYear)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 }}>
            {CROP_YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setPriceEdits(market); setPriceModalOpen(true); }}>Update prices</button>
          <button className="btn-primary" onClick={() => { setEditingContract(undefined); setModal('add'); }}>+ Add contract</button>
        </div>
      </div>

      {/* Advice banner */}
      <div style={{ ...cardStyle, borderLeft: `4px solid ${advice.colour}`, marginBottom: 16, background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{advice.signal === 'sell' ? '⚠️' : advice.signal === 'hold' ? '✅' : '👁️'}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{advice.title}</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5 }}>{advice.body}</div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div style={kpiStyle}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Est. Total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {editingEstimate ? (
              <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                <input type="number" value={newEstimate} onChange={e => setNewEstimate(e.target.value)}
                  style={{ width: 70, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', textAlign: 'center', fontSize: 14 }} />
                <button className="btn-primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={saveEstimate}>✓</button>
              </span>
            ) : (
              <span onClick={() => { setNewEstimate(String(position.estimatedTotalTonnes)); setEditingEstimate(true); }}
                style={{ cursor: 'pointer', borderBottom: '1px dashed var(--color-muted)' }}
                title="Click to edit">
                {fmtT(position.estimatedTotalTonnes)}
              </span>
            )}
          </div>
        </div>
        <div style={kpiStyle}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Sold</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtT(totalSold)}</div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{pctSold.toFixed(0)}% of crop</div>
        </div>
        <div style={kpiStyle}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Unsold</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: unsold > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>{fmtT(unsold)}</div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>~{fmtMoney(unsoldValue)} @ spot</div>
        </div>
        <div style={kpiStyle}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Avg sold price</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{avgPrice > 0 ? fmtPpt(avgPrice) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Spot: {fmtPpt(spotRef)}</div>
        </div>
        <div style={kpiStyle}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>Contracted value</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success)' }}>{totalValue > 0 ? fmtMoney(totalValue) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{activeContracts.length} contract{activeContracts.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Futures strip */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>ICE UK Feed Wheat Futures</div>
          {lastFetch && <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Updated {new Date(lastFetch).toLocaleDateString('en-GB')}</div>}
          {!lastFetch && <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Enter prices manually — or daily briefing will update these</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {market.map(m => (
            <div key={m.contract} style={{ background: 'var(--color-surface)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 2 }}>{m.contract}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>£{m.pricePerTonne.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Contracts table */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Contracts — {selectedYear}</div>
        {position.contracts.length === 0 ? (
          <div style={{ color: 'var(--color-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            No contracts logged for {selectedYear}. Click "+ Add contract" to record your first sale.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Crop', 'Buyer', 'Type', 'Tonnes', '£/t', 'Value', 'Delivery', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {position.contracts.map(c => {
                  const days = daysUntil(c.deliveryTo);
                  const deliveryLabel = c.deliveryFrom && c.deliveryTo
                    ? `${new Date(c.deliveryFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(c.deliveryTo).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}`
                    : c.deliveryTo ? new Date(c.deliveryTo).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: c.status === 'cancelled' ? 0.5 : 1 }}>
                      <td style={{ padding: '8px', fontWeight: 500 }}>{c.crop}</td>
                      <td style={{ padding: '8px' }}>{c.buyer}</td>
                      <td style={{ padding: '8px', textTransform: 'capitalize', color: 'var(--color-muted)' }}>{c.contractType}</td>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{fmtT(c.tonnes)}</td>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{fmtPpt(c.pricePerTonne)}</td>
                      <td style={{ padding: '8px' }}>{fmtMoney(c.tonnes * c.pricePerTonne)}</td>
                      <td style={{ padding: '8px', fontSize: 12, color: days !== null && days < 14 && days >= 0 ? 'var(--color-warning)' : 'var(--color-text)', whiteSpace: 'nowrap' }}>{deliveryLabel}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: statusColor(c.status) + '22', color: statusColor(c.status), fontWeight: 600, textTransform: 'capitalize' }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', marginRight: 4 }}
                          onClick={() => { setEditingContract(c); setModal('edit'); }}>Edit</button>
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--color-danger)' }}
                          onClick={() => deleteContract(c.id)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Contract modal */}
      {modal && (
        <ContractModal
          cropYear={selectedYear}
          existing={modal === 'edit' ? editingContract : undefined}
          onSave={modal === 'edit' ? updateContract : addContract}
          onClose={() => { setModal(null); setEditingContract(undefined); }}
        />
      )}

      {/* Update prices modal */}
      {priceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--color-card)', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Update Market Prices</h3>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 12 }}>Enter ICE UK feed wheat futures (£/t). The daily briefing will also update these automatically when it runs.</div>
            {priceEdits.map((p, i) => (
              <div key={p.contract} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input value={p.contract} onChange={e => { const a = [...priceEdits]; a[i] = { ...a[i], contract: e.target.value }; setPriceEdits(a); }}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 }} />
                <input type="number" step="0.25" value={p.pricePerTonne} onChange={e => { const a = [...priceEdits]; a[i] = { ...a[i], pricePerTonne: parseFloat(e.target.value) }; setPriceEdits(a); }}
                  style={{ width: 80, padding: '6px 8px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn-secondary" onClick={() => setPriceModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={savePrices}>Save prices</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
