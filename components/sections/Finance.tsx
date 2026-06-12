'use client';

import { useState, useMemo } from 'react';
import { FarmData } from '@/lib/types';
import type { Finance } from '@/lib/types';
import { fmtDate, fmtMoney, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const CATEGORIES = ['Feed', 'Seed', 'Fertiliser', 'Sprays', 'Vet & medicine', 'Machinery', 'Fuel', 'Labour', 'Rent', 'Utilities', 'Cattle sales', 'Grain sales', 'Scheme payments', 'Agronomy', 'Insurance', 'Professional fees', 'Contracting', 'Repairs', 'Bedding', 'Other'];

type View = 'outstanding' | 'all' | 'cashflow';

export default function FinanceSection({ db, persist, addActivity }: Props) {
  const [view, setView] = useState<View>('outstanding');
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = add new, set = editing existing
  const [type, setType] = useState('Bill');
  const [status, setStatus] = useState('Outstanding');
  const [supplier, setSupplier] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Other');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [net, setNet] = useState('');
  const [vatRate, setVatRate] = useState('20%');
  const [due, setDue] = useState('');
  const [ref, setRef] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [scanModal, setScanModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importSelections, setImportSelections] = useState<Record<number, boolean>>({});

  const finance = db.finance || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(today.getDate() + 7);
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);

  // ── Briefing invoices not yet imported ──────────────────────────────────
  const briefing = db.dailyBriefing;
  const pendingBriefingInvoices = useMemo(() => {
    if (!briefing?.invoices?.length) return [];
    const existingRefs = new Set(finance.map(f => f.ref).filter(Boolean));
    const existingBriefKeys = new Set(finance.map(f => f.briefingDate).filter(Boolean));
    return briefing.invoices.filter((inv, idx) => {
      if (inv.ref && existingRefs.has(inv.ref)) return false;
      if (existingBriefKeys.has(briefing.date + '_' + idx)) return false;
      return true;
    });
  }, [briefing, finance]);

  // ── Outstanding items ────────────────────────────────────────────────────
  const outstanding = finance.filter(f => f.status === 'Outstanding');
  const overdue = outstanding.filter(f => f.due && new Date(f.due + 'T12:00:00') < today);
  const dueThisWeek = outstanding.filter(f => f.due && new Date(f.due + 'T12:00:00') >= today && new Date(f.due + 'T12:00:00') <= in7);
  const dueThisMonth = outstanding.filter(f => f.due && new Date(f.due + 'T12:00:00') > in7 && new Date(f.due + 'T12:00:00') <= in30);
  const noDueDate = outstanding.filter(f => !f.due);

  // ── All-records filtered ─────────────────────────────────────────────────
  const allFiltered = finance.filter(f => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (supplierSearch.trim() && !f.supplier?.toLowerCase().includes(supplierSearch.toLowerCase()) && !f.ref?.toLowerCase().includes(supplierSearch.toLowerCase())) return false;
    return true;
  }).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // ── Cash flow by month ───────────────────────────────────────────────────
  const cashFlowMonths = useMemo(() => {
    const map: Record<string, { in: number; out: number }> = {};
    finance.forEach(f => {
      if (!f.date) return;
      const month = f.date.slice(0, 7);
      if (!map[month]) map[month] = { in: 0, out: 0 };
      const g = f.gross || f.amount || 0;
      if (f.type === 'Invoice') map[month].in += g;
      else map[month].out += g;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  }, [finance]);

  const calcVat = (n: number, rate: string): number => {
    if (rate === 'Exempt' || rate === '0%') return 0;
    const r = parseFloat(rate) / 100;
    return Math.round(n * r * 100) / 100;
  };

  const vatAmount = calcVat(parseFloat(net) || 0, vatRate);
  const gross = (parseFloat(net) || 0) + vatAmount;

  function openAdd() {
    resetForm();
    setEditingId(null);
    setModal(true);
  }

  function openEdit(f: Finance, idx: number) {
    setType(f.type || 'Bill');
    setStatus(f.status || 'Outstanding');
    setSupplier(f.supplier || '');
    setDesc(f.desc || '');
    setCategory(f.category || 'Other');
    setDate(f.date || new Date().toISOString().slice(0, 10));
    setNet(String(f.net ?? ''));
    setVatRate(f.vatRate || '20%');
    setDue(f.due || '');
    setRef(f.ref || '');
    setEditingId(f.id ?? `__idx_${idx}`);
    setModal(true);
  }

  function saveFinance() {
    if (!supplier.trim() || !net.trim()) return alert('Supplier and net amount required');
    const n = parseFloat(net);
    if (isNaN(n) || n < 0) return alert('Invalid net amount');

    if (editingId !== null) {
      // Update existing record
      const updated = finance.map((f, i) => {
        const matches = editingId.startsWith('__idx_')
          ? i === parseInt(editingId.replace('__idx_', ''))
          : f.id === editingId;
        if (!matches) return f;
        return {
          ...f,
          type, status,
          supplier: supplier.trim(),
          desc: desc.trim() || supplier.trim(),
          category, date,
          net: n, vat: vatAmount, gross: n + vatAmount, vatRate,
          due, ref: ref.trim(), amount: n
        };
      });
      addActivity(`Updated ${type.toLowerCase()}: ${supplier}`);
      persist({ ...db, finance: updated });
    } else {
      // Add new record
      const item: Finance = {
        id: uid(),
        type, status,
        supplier: supplier.trim(),
        desc: desc.trim() || supplier.trim(),
        category, date,
        net: n, vat: vatAmount, gross: n + vatAmount, vatRate,
        due, ref: ref.trim(), amount: n
      };
      addActivity(`Added ${type.toLowerCase()}: ${supplier}`);
      persist({ ...db, finance: [...finance, item] });
    }
    resetForm();
    setModal(false);
  }

  function resetForm() {
    setType('Bill'); setStatus('Outstanding'); setSupplier(''); setDesc('');
    setCategory('Other'); setDate(new Date().toISOString().slice(0, 10));
    setNet(''); setVatRate('20%'); setDue(''); setRef('');
    setEditingId(null);
  }

  function deleteFinance(id: string | undefined, idx: number) {
    if (!confirm('Delete this record?')) return;
    if (id) persist({ ...db, finance: finance.filter(f => f.id !== id) });
    else persist({ ...db, finance: finance.filter((_, i) => i !== idx) });
  }

  function markPaid(id: string | undefined, idx: number) {
    const updated = finance.map((f, i) => {
      if (id ? f.id === id : i === idx) return { ...f, status: 'Paid' };
      return f;
    });
    persist({ ...db, finance: updated });
  }

  // ── Import from briefing ─────────────────────────────────────────────────
  function openImport() {
    const init: Record<number, boolean> = {};
    pendingBriefingInvoices.forEach((_, i) => { init[i] = true; });
    setImportSelections(init);
    setImportModal(true);
  }

  function doImport() {
    if (!briefing) return;
    const toImport = pendingBriefingInvoices.filter((_, i) => importSelections[i]);
    if (!toImport.length) return alert('Nothing selected');

    const newItems: Finance[] = toImport.map((inv, i) => {
      const g = inv.gross || (typeof inv.amount === 'string' ? parseFloat(inv.amount.replace(/[^0-9.]/g, '')) : 0) || 0;
      const n = inv.net || (inv.vatRate === '0%' || inv.vatRate === 'Exempt' ? g : Math.round(g / 1.2 * 100) / 100);
      const v = inv.vat || Math.round((g - n) * 100) / 100;
      const invIdx = pendingBriefingInvoices.indexOf(inv);
      return {
        id: uid(),
        type: 'Bill',
        status: 'Outstanding',
        supplier: inv.supplier || 'Unknown',
        desc: inv.notes || inv.supplier || '',
        category: inv.category || 'Other',
        date: inv.invoiceDate || briefing.date,
        net: n,
        vat: v,
        gross: g,
        vatRate: inv.vatRate || '20%',
        due: inv.due || '',
        ref: inv.ref || '',
        amount: g,
        briefingDate: briefing.date + '_' + invIdx,
      };
    });

    addActivity(`Imported ${newItems.length} invoice${newItems.length !== 1 ? 's' : ''} from briefing`);
    persist({ ...db, finance: [...finance, ...newItems] });
    setImportModal(false);
  }

  function exportCSV() {
    const headers = ['Type', 'Status', 'Supplier', 'Description', 'Category', 'Date', 'Net', 'VAT', 'Gross', 'Due', 'Ref'];
    const rows = allFiltered.map(f => [f.type, f.status, f.supplier, f.desc, f.category, f.date, f.net, f.vat, f.gross, f.due, f.ref]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `farm-finance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function handleScanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('uaf_anthropic_key') : null;
    if (!apiKey) return alert('Please set your Anthropic API key in Settings first');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64 = (ev.target?.result as string).split(',')[1];
        const ext = file.name.split('.').pop()?.toLowerCase();
        const mediaType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 500, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: 'Extract: supplier name, invoice date (YYYY-MM-DD), net amount, VAT amount, total/gross amount. Format as JSON: supplier, date, net, vat, gross.' }] }] })
        });
        if (!response.ok) { alert('Scan failed: ' + (await response.text())); return; }
        const data = await response.json();
        const text = data.content[0]?.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        const extracted = JSON.parse(match?.[0] || '{}');
        setSupplier(extracted.supplier || '');
        setDate(extracted.date || new Date().toISOString().slice(0, 10));
        setNet(String(extracted.net || ''));
        setScanModal(false);
        setModal(true);
      } catch { alert('Could not parse invoice. Please fill manually.'); }
    };
    reader.readAsDataURL(file);
  }

  const totalOutstanding = outstanding.reduce((a, b) => a + (b.gross || 0), 0);
  const totalOverdue = overdue.reduce((a, b) => a + (b.gross || 0), 0);
  const inputVat = outstanding.filter(f => f.type === 'Bill').reduce((a, b) => a + (b.vat || 0), 0);

  function dueLabel(f: Finance): { label: string; color: string } {
    if (!f.due) return { label: 'No due date', color: 'var(--text-muted, #888)' };
    const d = new Date(f.due + 'T12:00:00');
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: 'var(--red, #dc2626)' };
    if (diff === 0) return { label: 'Due today', color: 'var(--red, #dc2626)' };
    if (diff <= 7) return { label: `Due in ${diff}d`, color: 'var(--amber, #d97706)' };
    return { label: fmtDate(f.due), color: 'var(--text-muted, #888)' };
  }

  function OutstandingGroup({ title, items, color }: { title: string; items: Finance[]; color: string }) {
    if (!items.length) return null;
    const total = items.reduce((a, b) => a + (b.gross || 0), 0);
    return (
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{title}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color }}>{fmtMoney(total)}</span>
        </div>
        {items.map((f) => {
          const dl = dueLabel(f);
          const idx = finance.indexOf(f);
          return (
            <div key={f.id || idx} className="row-item" style={{ borderLeft: `3px solid ${color}`, paddingLeft: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="row-name" style={{ fontSize: 13 }}>{f.supplier}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>{fmtMoney(f.gross || 0)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                  <span className="badge bg-blue" style={{ fontSize: 10 }}>{f.category}</span>
                  {f.ref && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ref: {f.ref}</span>}
                  <span style={{ fontSize: 11, color: dl.color, fontWeight: 500 }}>{dl.label}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 8, flexShrink: 0 }}>
                <button className="done-btn" onClick={() => markPaid(f.id, idx)}>Paid</button>
                <button className="btn-primary" onClick={() => openEdit(f, idx)} style={{ fontSize: 11, padding: '0.25rem 0.5rem' }}>Edit</button>
                <button className="del-btn" onClick={() => deleteFinance(f.id, idx)}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const maxCF = Math.max(...cashFlowMonths.map(([, v]) => Math.max(v.in, v.out)), 1);

  return (
    <>
      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="btn-add" onClick={openAdd}>+ Add record</button>
        {pendingBriefingInvoices.length > 0 && (
          <button className="btn-primary" onClick={openImport} style={{ background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>
            📥 Import {pendingBriefingInvoices.length} invoice{pendingBriefingInvoices.length !== 1 ? 's' : ''} from briefing
          </button>
        )}
        <button className="btn-primary" onClick={() => setScanModal(true)}>📸 Scan invoice</button>
        <button className="btn-primary" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div className="metric-grid" style={{ marginBottom: '1rem' }}>
        <div className="metric-card">
          <div className="metric-label">Outstanding</div>
          <div className="metric-value">{outstanding.length}</div>
          <div className="metric-sub">{fmtMoney(totalOutstanding)}</div>
        </div>
        <div className="metric-card" style={totalOverdue > 0 ? { borderColor: 'var(--red, #dc2626)', borderWidth: 2, borderStyle: 'solid' } : {}}>
          <div className="metric-label" style={{ color: totalOverdue > 0 ? 'var(--red, #dc2626)' : undefined }}>Overdue</div>
          <div className="metric-value" style={{ color: totalOverdue > 0 ? 'var(--red, #dc2626)' : undefined }}>{overdue.length}</div>
          <div className="metric-sub">{fmtMoney(totalOverdue)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Due this week</div>
          <div className="metric-value">{dueThisWeek.length}</div>
          <div className="metric-sub">{fmtMoney(dueThisWeek.reduce((a, b) => a + (b.gross || 0), 0))}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Input VAT reclaimable</div>
          <div className="metric-value">{fmtMoney(inputVat)}</div>
          <div className="metric-sub">on outstanding bills</div>
        </div>
      </div>

      {/* ── View tabs ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        {(['outstanding', 'all', 'cashflow'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '0.4rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: view === v ? 700 : 400, color: view === v ? 'var(--primary)' : 'var(--text-muted)', borderBottom: view === v ? '2px solid var(--primary)' : '2px solid transparent', fontSize: 13 }}>
            {v === 'outstanding' ? 'Outstanding' : v === 'all' ? 'All records' : 'Cash flow'}
          </button>
        ))}
      </div>

      {/* ── Outstanding view ─────────────────────────────────────────────── */}
      {view === 'outstanding' && (
        <div className="card">
          {outstanding.length === 0
            ? <div className="empty">Nothing outstanding — all clear.</div>
            : <>
                <OutstandingGroup title="Overdue" items={overdue} color="var(--red, #dc2626)" />
                <OutstandingGroup title="Due this week" items={dueThisWeek} color="var(--amber, #d97706)" />
                <OutstandingGroup title="Due this month" items={dueThisMonth} color="var(--primary)" />
                <OutstandingGroup title="No due date set" items={noDueDate} color="var(--text-muted, #888)" />
              </>
          }
        </div>
      )}

      {/* ── All records view ─────────────────────────────────────────────── */}
      {view === 'all' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search supplier or ref…"
              style={{ padding: '0.4rem 0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, flex: '1 1 140px', minWidth: 120 }}
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13 }}>
              <option value="all">All types</option>
              <option value="Bill">Bills (payable)</option>
              <option value="Invoice">Invoices (receivable)</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13 }}>
              <option value="all">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="card">
            <div className="card-title">All records ({allFiltered.length})</div>
            {allFiltered.length === 0
              ? <div className="empty">No records match filters.</div>
              : allFiltered.map((f, i) => {
                  const idx = finance.indexOf(f);
                  return (
                    <div key={f.id || i} className="row-item">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div className="row-name">{f.supplier}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>{fmtMoney(f.gross || 0)}</div>
                        </div>
                        <div className="row-sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span>{fmtDate(f.date)}</span>
                          {f.ref && <span>· {f.ref}</span>}
                          <span className={`badge ${f.status === 'Outstanding' ? 'bg-amber' : 'bg-green'}`} style={{ fontSize: 10 }}>{f.status}</span>
                          <span className="badge bg-blue" style={{ fontSize: 10 }}>{f.category}</span>
                          {f.type === 'Invoice' && <span className="badge" style={{ background: 'var(--green-bg, #dcfce7)', color: 'var(--green, #166534)', fontSize: 10 }}>Receivable</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 8, flexShrink: 0 }}>
                        {f.status === 'Outstanding' && <button className="done-btn" onClick={() => markPaid(f.id, idx)}>Paid</button>}
                        <button className="btn-primary" onClick={() => openEdit(f, idx)} style={{ fontSize: 11, padding: '0.25rem 0.5rem' }}>Edit</button>
                        <button className="del-btn" onClick={() => deleteFinance(f.id, idx)}>×</button>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </>
      )}

      {/* ── Cash flow view ───────────────────────────────────────────────── */}
      {view === 'cashflow' && (
        <div className="card">
          <div className="card-title">Monthly cash flow (last 12 months)</div>
          {cashFlowMonths.length === 0
            ? <div className="empty">No data yet — add invoices and bills to see cash flow.</div>
            : <>
                <div style={{ display: 'flex', gap: 16, marginBottom: '0.75rem', fontSize: 12 }}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--primary)', borderRadius: 2, marginRight: 4 }} />Money in (invoices)</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--red, #dc2626)', borderRadius: 2, marginRight: 4 }} />Money out (bills)</span>
                </div>
                {cashFlowMonths.map(([month, vals]) => {
                  const inPct = Math.round((vals.in / maxCF) * 100);
                  const outPct = Math.round((vals.out / maxCF) * 100);
                  const netVal = vals.in - vals.out;
                  return (
                    <div key={month} style={{ marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: 60 }}>{month}</span>
                        <span style={{ color: netVal >= 0 ? 'var(--green, #166534)' : 'var(--red, #dc2626)', fontWeight: 600, fontSize: 11 }}>
                          {netVal >= 0 ? '+' : ''}{fmtMoney(netVal)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {vals.in > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: `${inPct}%`, minWidth: 2, height: 8, background: 'var(--primary)', borderRadius: 2 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtMoney(vals.in)}</span>
                          </div>
                        )}
                        {vals.out > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: `${outPct}%`, minWidth: 2, height: 8, background: 'var(--red, #dc2626)', borderRadius: 2 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtMoney(vals.out)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>12-month total in</span>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmtMoney(cashFlowMonths.reduce((a, [, v]) => a + v.in, 0))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>12-month total out</span>
                  <span style={{ fontWeight: 600, color: 'var(--red, #dc2626)' }}>{fmtMoney(cashFlowMonths.reduce((a, [, v]) => a + v.out, 0))}</span>
                </div>
              </>
          }
        </div>
      )}

      {/* ── Add modal ────────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">{editingId !== null ? 'Edit record' : 'Add record'}</div>
            <div className="field-row">
              <label className="form-label">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="Bill">Bill (money out)</option>
                <option value="Invoice">Invoice (money in)</option>
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Outstanding</option>
                <option>Paid</option>
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Supplier / customer</label>
              <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Name" />
            </div>
            <div className="field-row">
              <label className="form-label">Description</label>
              <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was purchased / sold" />
            </div>
            <div className="field-row">
              <label className="form-label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Net amount (£)</label>
              <input type="number" value={net} onChange={(e) => setNet(e.target.value)} placeholder="0.00" step="0.01" />
            </div>
            <div className="field-row">
              <label className="form-label">VAT rate</label>
              <select value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
                <option>20%</option>
                <option>5%</option>
                <option>0%</option>
                <option>Exempt</option>
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">VAT (£)</label>
              <input type="number" value={vatAmount.toFixed(2)} disabled style={{ background: 'var(--bg-secondary)' }} />
            </div>
            <div className="field-row">
              <label className="form-label">Gross (£)</label>
              <input type="number" value={gross.toFixed(2)} disabled style={{ background: 'var(--bg-secondary)' }} />
            </div>
            <div className="field-row">
              <label className="form-label">Due date</label>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Reference</label>
              <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice / bill number" />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={saveFinance}>{editingId !== null ? 'Save changes' : 'Save'}</button>
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan modal ───────────────────────────────────────────────────── */}
      {scanModal && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setScanModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Scan invoice</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>Upload a photo or PDF — we'll extract the details and prefill the form.</p>
            <input type="file" accept="image/*,.pdf" onChange={handleScanUpload} style={{ display: 'block', marginBottom: '1rem', width: '100%' }} />
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setScanModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import from briefing modal ───────────────────────────────────── */}
      {importModal && briefing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setImportModal(false)}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-title">Import invoices from briefing</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
              From briefing {fmtDate(briefing.date)} — tick the ones to add to Finance
            </p>
            {pendingBriefingInvoices.map((inv, i) => {
              const g = inv.gross || (typeof inv.amount === 'string' ? parseFloat(inv.amount.replace(/[^0-9.]/g, '')) : 0) || 0;
              return (
                <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.6rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!importSelections[i]} onChange={(e) => setImportSelections(s => ({ ...s, [i]: e.target.checked }))} style={{ marginTop: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{inv.supplier || 'Unknown supplier'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {inv.ref && <span>Ref: {inv.ref} · </span>}
                      {inv.category && <span>{inv.category} · </span>}
                      {g > 0 ? <span style={{ fontWeight: 600 }}>{fmtMoney(g)}</span> : <span style={{ color: 'var(--amber, #d97706)' }}>Amount in PDF — check email</span>}
                      {inv.due && <span> · Due {fmtDate(inv.due)}</span>}
                    </div>
                    {inv.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{inv.notes}</div>}
                  </div>
                </label>
              );
            })}
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={doImport}>
                Import {Object.values(importSelections).filter(Boolean).length} selected
              </button>
              <button className="btn-cancel" onClick={() => setImportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
