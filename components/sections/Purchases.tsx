'use client';

import { useState, useMemo } from 'react';
import type { FarmData, PurchaseOrder, PurchaseProduct } from '@/lib/types';

type Tab = 'orders' | 'products' | 'spend';
type OrderType = 'All' | 'Fertiliser' | 'Chemical' | 'Seed';

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
  // Try to parse and reformat
  try {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {}
  return d;
}

export default function Purchases({ db, persist }: { db: FarmData; persist: (d: FarmData) => void }) {
  const [tab, setTab] = useState<Tab>('orders');
  const [typeFilter, setTypeFilter] = useState<OrderType>('All');
  const [showCancelled, setShowCancelled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const orders = db.purchases ?? [];
  const syncStatus = db.purchasesSyncStatus;

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (!showCancelled && o.cancelled) return false;
      if (typeFilter !== 'All' && o.type !== typeFilter) return false;
      return true;
    });
  }, [orders, typeFilter, showCancelled]);

  const activeOrders = orders.filter(o => !o.cancelled);

  // Spend summary
  const totalSpend = activeOrders.reduce((s, o) => s + o.totalValue, 0);
  const byType = {
    Fertiliser: activeOrders.filter(o => o.type === 'Fertiliser').reduce((s, o) => s + o.totalValue, 0),
    Chemical:   activeOrders.filter(o => o.type === 'Chemical').reduce((s, o) => s + o.totalValue, 0),
    Seed:       activeOrders.filter(o => o.type === 'Seed').reduce((s, o) => s + o.totalValue, 0),
  };

  // Product price reference — latest price per product name
  const productRef = useMemo(() => {
    const map = new Map<string, { price: number; unit: string; supplier: string; date: string; orderRef: string }>();
    // Process oldest first so latest overwrites
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

  async function doSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/purchases/sync');
      const data = await res.json();
      if (data.ok) {
        setSyncMsg(`✅ Synced ${data.ordersFound} orders — reload to see latest data`);
        // Note: the sync writes directly to Supabase; the user needs to reload
        // to pick up the new data from Supabase. In a future version we can
        // refresh the db object here.
      } else {
        setSyncMsg(`❌ ${data.error || 'Sync failed'}`);
      }
    } catch (e) {
      setSyncMsg(`❌ ${e instanceof Error ? e.message : 'Network error'}`);
    }
    setSyncing(false);
  }

  return (
    <div className="section-wrap">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 20, color: 'var(--green)', marginBottom: 2 }}>
            Purchases — Crop Advisors
          </div>
          {syncStatus && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Last synced: {fmtDate(syncStatus.syncedAt.slice(0, 10))} · {syncStatus.ordersFound} orders
            </div>
          )}
          {!syncStatus && orders.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              No orders yet — click Sync to pull from Gmail
            </div>
          )}
        </div>
        <button
          className="btn-primary"
          onClick={doSync}
          disabled={syncing}
          style={{ minWidth: 120 }}
        >
          {syncing ? '⏳ Syncing…' : '⟳ Sync Gmail'}
        </button>
      </div>

      {syncMsg && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius)',
          background: syncMsg.startsWith('✅') ? '#edf7f1' : '#fcecea',
          color: syncMsg.startsWith('✅') ? '#2d7d46' : 'var(--red)',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {syncMsg}
          {syncMsg.startsWith('✅') && (
            <button
              onClick={() => window.location.reload()}
              style={{ marginLeft: 12, fontSize: 12, background: 'none', border: '1px solid #2d7d46', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: '#2d7d46' }}
            >
              Reload now
            </button>
          )}
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
        {(['orders', 'products', 'spend'] as Tab[]).map(t => (
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
            {t === 'orders' ? '📋 Orders' : t === 'products' ? '🧪 Product Prices' : '📊 Spend Breakdown'}
          </button>
        ))}
      </div>

      {/* ── Orders tab ── */}
      {tab === 'orders' && (
        <>
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
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Product prices tab ── */}
      {tab === 'products' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Latest unit price per product across all Crop Advisors orders. Use for enterprise cost of production calculations.
          </p>
          {productRef.length === 0 ? (
            <EmptyState />
          ) : (
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
                  {productRef
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(p => (
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

      {/* ── Spend breakdown tab ── */}
      {tab === 'spend' && (
        <SpendBreakdown orders={activeOrders} />
      )}
    </div>
  );
}

/* ── Order card ───────────────────────────────────────────────────── */
function OrderCard({ order, expanded, onToggle }: { order: PurchaseOrder; expanded: boolean; onToggle: () => void }) {
  const colour = TYPE_COLOUR[order.type] || '#666';
  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${colour}`,
        opacity: order.cancelled ? 0.55 : 1,
        cursor: 'pointer',
        padding: '10px 14px',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          background: colour,
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 10,
          letterSpacing: 0.3,
        }}>
          {order.type}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{order.ref}</span>
        {order.cancelled && (
          <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, background: '#fcecea', padding: '2px 7px', borderRadius: 10 }}>
            CANCELLED
          </span>
        )}
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{order.supplier || '—'}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14 }}>£{order.totalValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 90, textAlign: 'right' }}>{fmtDate(order.date)}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {order.paymentDue && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Payment due: {fmtDate(order.paymentDue)}
        </div>
      )}

      {expanded && order.products.length > 0 && (
        <div style={{ marginTop: 12, overflowX: 'auto' }} onClick={e => e.stopPropagation()}>
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
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Source: {order.source}
        </div>
      )}
    </div>
  );
}

/* ── Spend breakdown ─────────────────────────────────────────────── */
function SpendBreakdown({ orders }: { orders: PurchaseOrder[] }) {
  // Group by season based on order ref number ranges (rough heuristic)
  // and by type
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

            {/* Bar chart of products */}
            {productsSorted.map(([name, value]) => (
              <div key={name} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span>{name}</span>
                  <span style={{ fontWeight: 600 }}>£{fmt(value)}</span>
                </div>
                <div style={{ height: 6, background: '#eee', borderRadius: 3 }}>
                  <div style={{
                    height: 6,
                    background: colour,
                    borderRadius: 3,
                    width: `${Math.round((value / typeTotal) * 100)}%`,
                  }} />
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

/* ── Small helpers ─────────────────────────────────────────────────── */
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
      <div style={{ fontSize: 12, marginTop: 4 }}>Click "Sync Gmail" to pull Crop Advisors orders from your email</div>
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{ textAlign: align || 'left', padding: '6px 8px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

function Td({ children, align, style }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties }) {
  return (
    <td style={{ textAlign: align || 'left', padding: '6px 8px', verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  );
}
