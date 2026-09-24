'use client';

import { useState, useMemo, useRef } from 'react';
import type { FarmData, PurchaseOrder, PurchaseProduct, StockProduct } from '@/lib/types';

type Tab = 'orders' | 'products' | 'spend' | 'inventory';
type OrderType = 'All' | 'Fertiliser' | 'Chemical' | 'Seed';

/* ─── Live inventory: opening stock + purchases − actual usage ─────────────
   Matches by name/alias (case-insensitive, trimmed, substring both ways) against
   purchase order product names and against sprays[]/fertilisers[] actual usage. */

function normUnit(u: string): 'L' | 'kg' | 'other' {
  const s = (u || '').toLowerCase();
  if (s.includes('litre') || s === 'l' || s.includes('/l')) return 'L';
  if (s.includes('tonne') || s.includes('/t') || s === 't') return 'kg'; // convert below
  if (s.includes('kg') || s === 'g' || s.includes('/g')) return 'kg'; // convert below
  return 'other';
}

// Convert a quantity in `fromUnit` into the stock product's own unit (L, kg or g)
function toStockUnit(qty: number, fromUnit: string, stockUnit: string): number {
  const from = (fromUnit || '').toLowerCase();
  const to = (stockUnit || '').toLowerCase();
  let kgOrL = qty;
  // normalise `from` to kg or L base
  if (from.includes('tonne') || from === 't') kgOrL = qty * 1000; // → kg
  else if (from === 'g' || from.includes('gram')) kgOrL = qty / 1000; // → kg
  else if (from.includes('ml')) kgOrL = qty / 1000; // → L
  // now express in the stock's own unit
  if (to === 'g') return kgOrL * 1000; // kg → g
  if (to === 't') return kgOrL / 1000; // kg → t
  return kgOrL; // already L or kg, matches
}

function nameMatches(candidate: string, product: StockProduct): boolean {
  const c = candidate.toLowerCase().trim();
  if (!c) return false;
  const names = [product.name, ...(product.aliases || [])].map(n => n.toLowerCase().trim());
  return names.some(n => n && (c === n || c.includes(n) || n.includes(c)));
}

interface StockRow {
  product: StockProduct;
  purchasedQty: number;
  usedQty: number;
  currentQty: number;
  latestUnitPrice: number | null;
  estValue: number | null;
}

function computeStockRows(db: FarmData): StockRow[] {
  const products = db.stockProducts ?? [];
  const purchases = db.purchases ?? [];
  const sprays = db.sprays ?? [];
  const fertilisers = db.fertilisers ?? [];

  return products.map(product => {
    let purchasedQty = 0;
    let latestUnitPrice: number | null = null;
    let latestDate = '';
    for (const order of purchases) {
      if (order.cancelled) continue;
      for (const p of order.products) {
        if (!nameMatches(p.name, product)) continue;
        purchasedQty += toStockUnit(p.quantity, p.unit, product.unit);
        if (!latestDate || order.date > latestDate) {
          latestDate = order.date;
          const puLower = (p.priceUnit || '').toLowerCase();
          const perStockUnit = puLower.includes('tonne') ? p.pricePerUnit / toStockUnit(1000, 'kg', product.unit)
            : toStockUnit(1, p.unit, product.unit) > 0 ? p.pricePerUnit / toStockUnit(1, p.unit, product.unit)
            : p.pricePerUnit;
          latestUnitPrice = perStockUnit;
        }
      }
    }
    let usedQty = 0;
    if (product.category === 'Chemical') {
      for (const s of sprays) {
        if (!nameMatches(s.product, product)) continue;
        usedQty += toStockUnit(s.totalProduct || 0, s.doseUnit?.replace('/ha', '') || 'L', product.unit);
      }
    } else {
      for (const f of fertilisers) {
        if (!nameMatches(f.product || f.type, product)) continue;
        usedQty += toStockUnit(f.totalApplied || 0, 'kg', product.unit);
      }
    }
    const currentQty = product.openingStock + purchasedQty - usedQty;
    const estValue = latestUnitPrice != null ? currentQty * latestUnitPrice : null;
    return { product, purchasedQty, usedQty, currentQty, latestUnitPrice, estValue };
  });
}

function uidShort(): string {
  return 'stk_' + Math.random().toString(36).slice(2, 10);
}

const TYPE_COLOUR: Record<string, string> = {
  Fertiliser: '#2d7d46',
  Chemical:   '#c17b00',
  Seed:       '#5b4fcf',
  Other:      '#666',
};

function fmt(n: number) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {}
  return d;
}

function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export default function Purchases({ db, persist }: { db: FarmData; persist: (d: FarmData) => void }) {
  const [tab, setTab] = useState<Tab>('orders');
  const [typeFilter, setTypeFilter] = useState<OrderType>('All');
  const [showCancelled, setShowCancelled] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orders = db.purchases ?? [];

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (!showCancelled && o.cancelled) return false;
      if (typeFilter !== 'All' && o.type !== typeFilter) return false;
      return true;
    });
  }, [orders, typeFilter, showCancelled]);

  const activeOrders = orders.filter(o => !o.cancelled);
  const totalSpend = activeOrders.reduce((s, o) => s + o.totalValue, 0);
  const byType = {
    Fertiliser: activeOrders.filter(o => o.type === 'Fertiliser').reduce((s, o) => s + o.totalValue, 0),
    Chemical:   activeOrders.filter(o => o.type === 'Chemical').reduce((s, o) => s + o.totalValue, 0),
    Seed:       activeOrders.filter(o => o.type === 'Seed').reduce((s, o) => s + o.totalValue, 0),
  };

  const productRef = useMemo(() => {
    const map = new Map<string, { price: number; unit: string; supplier: string; date: string; orderRef: string }>();
    const sorted = [...activeOrders].sort((a, b) => a.ref.localeCompare(b.ref));
    for (const order of sorted) {
      for (const p of order.products) {
        map.set(p.name, {
          price: p.pricePerUnit,
          unit: p.priceUnit,
          supplier: order.supplier,
          date: order.date,
          orderRef: order.ref,
        });
      }
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
  }, [activeOrders]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg('');

    const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      setUploadMsg('❌ No PDF files selected');
      setUploading(false);
      return;
    }

    let added = 0;
    let skipped = 0;
    const errors: string[] = [];
    const newOrdersAccumulated: PurchaseOrder[] = [...orders];

    for (const file of pdfFiles) {
      try {
        const formData = new FormData();
        formData.append('pdf', file);
        const res = await fetch('/api/purchases/parse', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json() as { ok: boolean; order?: PurchaseOrder; error?: string };
        if (data.ok && data.order) {
          const exists = newOrdersAccumulated.some(o => o.ref === data.order!.ref);
          if (exists) {
            skipped++;
          } else {
            newOrdersAccumulated.push(data.order);
            added++;
          }
        } else {
          errors.push(`${file.name}: ${data.error || 'Could not parse'}`);
        }
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : 'Upload failed'}`);
      }
    }

    // Save all new orders in one persist call
    if (added > 0) {
      persist({
        ...db,
        purchases: newOrdersAccumulated,
        purchasesSyncStatus: {
          syncedAt: new Date().toISOString(),
          ordersFound: newOrdersAccumulated.length,
        },
      });
      setUploadMsg(`✅ Added ${added} order${added !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} already exist` : ''}${errors.length > 0 ? ` · ${errors.length} failed` : ''}`);
    } else if (skipped > 0) {
      setUploadMsg(`ℹ️ ${skipped} order${skipped !== 1 ? 's' : ''} already in Hub`);
    } else {
      setUploadMsg(`❌ ${errors.join(', ')}`);
    }

    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function deleteOrder(id: string) {
    if (!confirm('Remove this order?')) return;
    const newOrders = orders.filter(o => o.id !== id);
    persist({ ...db, purchases: newOrders });
  }

  return (
    <div className="section-wrap">
      {/* Header */}
      <div style={{ fontFamily: 'Lora, serif', fontSize: 20, color: 'var(--green)', marginBottom: 4 }}>
        Purchases — Crop Advisors
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {orders.length > 0 ? `${orders.length} orders · £${fmt(totalSpend)} total spend` : 'Drop Crop Advisors order PDFs below to get started'}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--green)' : '#ccc'}`,
          borderRadius: 10,
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#edf7f1' : 'transparent',
          marginBottom: 12,
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>
          {uploading ? '⏳ Processing…' : 'Drop Crop Advisors PDFs here'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          or click to browse — supports multiple files at once
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {uploadMsg && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius)',
          background: uploadMsg.startsWith('✅') ? '#edf7f1' : uploadMsg.startsWith('ℹ️') ? '#f0f4ff' : '#fcecea',
          color: uploadMsg.startsWith('✅') ? '#2d7d46' : uploadMsg.startsWith('ℹ️') ? '#3b5bdb' : 'var(--red)',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {uploadMsg}
        </div>
      )}

      {/* Summary cards */}
      {activeOrders.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          <SummaryCard label="Total spend" value={`£${fmt(totalSpend)}`} colour="var(--green)" />
          <SummaryCard label="Fertiliser" value={`£${fmt(byType.Fertiliser)}`} colour={TYPE_COLOUR.Fertiliser} sub={`${activeOrders.filter(o => o.type === 'Fertiliser').length} orders`} />
          <SummaryCard label="Chemical" value={`£${fmt(byType.Chemical)}`} colour={TYPE_COLOUR.Chemical} sub={`${activeOrders.filter(o => o.type === 'Chemical').length} orders`} />
          <SummaryCard label="Seed" value={`£${fmt(byType.Seed)}`} colour={TYPE_COLOUR.Seed} sub={`${activeOrders.filter(o => o.type === 'Seed').length} orders`} />
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(orders.length > 0 ? (['orders', 'products', 'spend', 'inventory'] as Tab[]) : (['inventory'] as Tab[])).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'DM Sans, sans-serif',
              background: tab === t ? 'var(--green)' : 'var(--card)',
              color: tab === t ? '#fff' : 'var(--text)',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'orders' ? '📋 Orders' : t === 'products' ? '🧪 Product Prices' : t === 'spend' ? '📊 Spend Breakdown' : '📦 Live Inventory'}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {tab === 'orders' && (
        <>
          {orders.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {(['All', 'Fertiliser', 'Chemical', 'Seed'] as OrderType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    padding: '3px 12px',
                    borderRadius: 20,
                    border: `1px solid ${typeFilter === t ? (TYPE_COLOUR[t] || 'var(--green)') : '#ddd'}`,
                    background: typeFilter === t ? (TYPE_COLOUR[t] || 'var(--green)') : 'transparent',
                    color: typeFilter === t ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {t}
                </button>
              ))}
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
                Show cancelled
              </label>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  expanded={expandedOrder === order.id}
                  onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  onDelete={() => deleteOrder(order.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Product prices tab */}
      {tab === 'products' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Latest unit price per product across all orders — use for enterprise cost of production.
          </p>
          {productRef.length === 0 ? <EmptyState /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--card)', borderBottom: '2px solid var(--border)' }}>
                    <Th>Product</Th>
                    <Th>Supplier</Th>
                    <Th align="right">Price</Th>
                    <Th>Unit</Th>
                    <Th>Order ref</Th>
                    <Th>Date</Th>
                  </tr>
                </thead>
                <tbody>
                  {productRef.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <Td><strong>{p.name}</strong></Td>
                      <Td>{p.supplier || '—'}</Td>
                      <Td align="right"><strong>£{fmt(p.price)}</strong></Td>
                      <Td style={{ color: 'var(--text-muted)' }}>{p.unit}</Td>
                      <Td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{p.orderRef}</Td>
                      <Td style={{ color: 'var(--text-muted)' }}>{fmtDate(p.date)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Spend breakdown tab */}
      {tab === 'spend' && <SpendBreakdown orders={activeOrders} />}

      {/* Live inventory tab */}
      {tab === 'inventory' && <LiveInventory db={db} persist={persist} />}
    </div>
  );
}

function LiveInventory({ db, persist }: { db: FarmData; persist: (d: FarmData) => void }) {
  const products = db.stockProducts ?? [];
  const rows = useMemo(() => computeStockRows(db), [db]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Chemical' as 'Chemical' | 'Fertiliser', unit: 'L', openingStock: '', aliases: '' });

  function addProduct() {
    if (!form.name.trim()) return;
    const newProduct: StockProduct = {
      id: uidShort(),
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      openingStock: parseFloat(form.openingStock) || 0,
      openingDate: new Date().toISOString().slice(0, 10),
      aliases: form.aliases.split(',').map(a => a.trim()).filter(Boolean),
    };
    persist({ ...db, stockProducts: [...products, newProduct] });
    setForm({ name: '', category: 'Chemical', unit: 'L', openingStock: '', aliases: '' });
    setAdding(false);
  }

  function deleteProduct(id: string) {
    if (!confirm('Remove this product from the live inventory?')) return;
    persist({ ...db, stockProducts: products.filter(p => p.id !== id) });
  }

  function updateOpeningStock(id: string, value: string) {
    const v = parseFloat(value);
    if (isNaN(v)) return;
    persist({
      ...db,
      stockProducts: products.map(p => p.id === id ? { ...p, openingStock: v, openingDate: new Date().toISOString().slice(0, 10) } : p),
    });
  }

  const chemRows = rows.filter(r => r.product.category === 'Chemical');
  const fertRows = rows.filter(r => r.product.category === 'Fertiliser');
  const totalValue = rows.reduce((s, r) => s + (r.estValue || 0), 0);

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        Set an opening stock once per product. From then on this updates itself — purchases you drop into the <strong>📋 Orders</strong> tab add to stock automatically, and actual applications from Luke's recommendations / John Deere Ops Centre deduct from it automatically. No manual updates needed unless you do a physical recount.
      </p>

      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          <SummaryCard label="Products tracked" value={`${rows.length}`} colour="var(--green)" />
          <SummaryCard label="Est. stock value" value={`£${fmt(totalValue)}`} colour="#c17b00" />
          <SummaryCard label="Low stock (<10%)" value={`${rows.filter(r => r.product.openingStock > 0 && r.currentQty / r.product.openingStock < 0.1).length}`} colour="#c0392b" />
        </div>
      )}

      {chemRows.length > 0 && <StockTable title="🧪 Chemicals" rows={chemRows} onDelete={deleteProduct} onEditOpening={updateOpeningStock} />}
      {fertRows.length > 0 && <StockTable title="🌿 Fertilisers" rows={fertRows} onDelete={deleteProduct} onEditOpening={updateOpeningStock} />}

      {rows.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <div style={{ fontSize: 14 }}>No products tracked yet — add your first one below.</div>
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{ marginTop: 12, padding: '7px 16px', borderRadius: 20, border: '1px dashed var(--green)', background: 'transparent', color: 'var(--green)', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
        >
          + Add product
        </button>
      ) : (
        <div className="card" style={{ marginTop: 12, padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input placeholder="Product name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })} style={inputStyle}>
              <option value="Chemical">Chemical</option>
              <option value="Fertiliser">Fertiliser</option>
            </select>
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputStyle}>
              <option value="L">L</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="t">t</option>
            </select>
            <input placeholder="Opening stock" type="number" value={form.openingStock} onChange={e => setForm({ ...form, openingStock: e.target.value })} style={inputStyle} />
          </div>
          <input placeholder="Other spellings/names seen elsewhere (comma separated, optional)" value={form.aliases} onChange={e => setForm({ ...form, aliases: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addProduct} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--green)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>Save</button>
            <button onClick={() => setAdding(false)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ccc', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans, sans-serif' };

function StockTable({ title, rows, onDelete, onEditOpening }: {
  title: string;
  rows: StockRow[];
  onDelete: (id: string) => void;
  onEditOpening: (id: string, value: string) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <Th>Product</Th>
              <Th align="right">Opening</Th>
              <Th align="right">+ Purchased</Th>
              <Th align="right">− Used</Th>
              <Th align="right">= Current</Th>
              <Th>Unit</Th>
              <Th align="right">Est. value</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.sort((a, b) => a.product.name.localeCompare(b.product.name)).map(r => {
              const low = r.product.openingStock > 0 && r.currentQty / r.product.openingStock < 0.1;
              return (
                <tr key={r.product.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td>
                    <strong>{r.product.name}</strong>
                    {r.product.notes && <div style={{ fontSize: 11, color: '#c17b00', marginTop: 2 }}>{r.product.notes}</div>}
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      defaultValue={r.product.openingStock}
                      onBlur={e => onEditOpening(r.product.id, e.target.value)}
                      style={{ width: 70, textAlign: 'right', padding: '2px 4px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                  </Td>
                  <Td align="right" style={{ color: '#2d7d46' }}>{r.purchasedQty > 0 ? `+${fmt(r.purchasedQty)}` : '—'}</Td>
                  <Td align="right" style={{ color: '#c0392b' }}>{r.usedQty > 0 ? `−${fmt(r.usedQty)}` : '—'}</Td>
                  <Td align="right" style={{ fontWeight: 700, color: low ? '#c0392b' : 'var(--text)' }}>{fmt(r.currentQty)}{low ? ' ⚠️' : ''}</Td>
                  <Td>{r.product.unit}</Td>
                  <Td align="right">{r.estValue != null ? `£${fmt(r.estValue)}` : '—'}</Td>
                  <Td align="right">
                    <button onClick={() => onDelete(r.product.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc' }}>✕</button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderCard({ order, expanded, onToggle, onDelete }: {
  order: PurchaseOrder;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const colour = TYPE_COLOUR[order.type] || '#666';
  return (
    <div className="card" style={{ borderLeft: `4px solid ${colour}`, opacity: order.cancelled ? 0.55 : 1, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={onToggle}>
        <span style={{ background: colour, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
          {order.type}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{order.ref}</span>
        {order.cancelled && (
          <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, background: '#fcecea', padding: '2px 7px', borderRadius: 10 }}>CANCELLED</span>
        )}
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{order.supplier || '—'}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14 }}>£{fmt(order.totalValue)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 90, textAlign: 'right' }}>{fmtDate(order.date)}</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#ccc', padding: '0 4px' }}
          title="Remove order"
        >✕</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {order.paymentDue && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Payment due: {fmtDate(order.paymentDue)}
        </div>
      )}

      {expanded && order.products.length > 0 && (
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <Th>Product</Th>
                <Th align="right">Qty</Th>
                <Th>Unit</Th>
                <Th>Bag size</Th>
                <Th align="right">£/unit</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {order.products.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td><strong>{p.name}</strong></Td>
                  <Td align="right">{p.quantity}</Td>
                  <Td>{p.unit}</Td>
                  <Td style={{ color: 'var(--text-muted)' }}>{p.bagSize}</Td>
                  <Td align="right">£{fmt(p.pricePerUnit)}</Td>
                  <Td align="right"><strong>£{fmt(p.totalValue)}</strong></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && order.source && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Source: {order.source}</div>
      )}
    </div>
  );
}

function SpendBreakdown({ orders }: { orders: PurchaseOrder[] }) {
  const byTypeProducts: Record<string, Record<string, number>> = {};
  for (const o of orders) {
    if (!byTypeProducts[o.type]) byTypeProducts[o.type] = {};
    for (const p of o.products) {
      byTypeProducts[o.type][p.name] = (byTypeProducts[o.type][p.name] || 0) + p.totalValue;
    }
  }
  const totalSpend = orders.reduce((s, o) => s + o.totalValue, 0);

  return (
    <div>
      {(['Fertiliser', 'Chemical', 'Seed'] as const).map(type => {
        const typeOrders = orders.filter(o => o.type === type);
        if (typeOrders.length === 0) return null;
        const typeTotal = typeOrders.reduce((s, o) => s + o.totalValue, 0);
        const products = byTypeProducts[type] || {};
        const productsSorted = Object.entries(products).sort((a, b) => b[1] - a[1]);
        const colour = TYPE_COLOUR[type];
        return (
          <div key={type} className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${colour}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: colour }}>{type}</div>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>£{fmt(typeTotal)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                  {totalSpend > 0 ? `${Math.round((typeTotal / totalSpend) * 100)}% of total` : ''}
                </span>
              </div>
            </div>
            {productsSorted.map(([name, value]) => (
              <div key={name} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span>{name}</span>
                  <span style={{ fontWeight: 600 }}>£{fmt(value)}</span>
                </div>
                <div style={{ height: 6, background: '#eee', borderRadius: 3 }}>
                  <div style={{ height: 6, background: colour, borderRadius: 3, width: `${Math.round((value / typeTotal) * 100)}%` }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              {typeOrders.length} order{typeOrders.length !== 1 ? 's' : ''} · {typeOrders.reduce((s, o) => s + o.products.length, 0)} product lines
            </div>
          </div>
        );
      })}
      {orders.length === 0 && <EmptyState />}
    </div>
  );
}

function SummaryCard({ label, value, colour, sub }: { label: string; value: string; colour: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: '10px 14px', borderTop: `3px solid ${colour}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colour }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
      <div style={{ fontSize: 14 }}>No orders yet</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Drop Crop Advisors PDF order confirmations above</div>
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return <th style={{ textAlign: align || 'left', padding: '6px 8px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{children}</th>;
}

function Td({ children, align, style }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties }) {
  return <td style={{ textAlign: align || 'left', padding: '6px 8px', verticalAlign: 'middle', ...style }}>{children}</td>;
}
