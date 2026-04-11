'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { Finance } from '@/lib/types';
import { fmtDate, fmtMoney, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const CATEGORIES = ['Feed', 'Seed', 'Fertiliser', 'Sprays', 'Vet & medicine', 'Machinery', 'Fuel', 'Labour', 'Rent', 'Utilities', 'Cattle sales', 'Grain sales', 'Scheme payments', 'Other'];

export default function Finance({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [type, setType] = useState('Invoice');
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scanModal, setScanModal] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);

  const finance = db.finance || [];

  const filtered = finance.filter(f => {
    if (typeFilter !== 'all' && !f.type.includes(typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1))) return false;
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    return true;
  });

  const calcVat = (n: number, rate: string): number => {
    if (rate === 'Exempt') return 0;
    const r = parseFloat(rate) / 100;
    return Math.round(n * r * 100) / 100;
  };

  const vatAmount = calcVat(parseFloat(net) || 0, vatRate);
  const gross = (parseFloat(net) || 0) + vatAmount;

  function saveFinance() {
    if (!supplier.trim() || !desc.trim() || !net.trim()) return alert('Supplier, description, and net amount required');
    const n = parseFloat(net);
    if (isNaN(n) || n < 0) return alert('Invalid net amount');

    const item: Finance = {
      type,
      status,
      supplier: supplier.trim(),
      desc: desc.trim(),
      category,
      date,
      net: n,
      vat: vatAmount,
      gross: n + vatAmount,
      vatRate,
      due,
      ref: ref.trim(),
      amount: n
    };

    addActivity(`Added ${type.toLowerCase()}: ${supplier}`);
    persist({ ...db, finance: [...finance, item] });
    resetForm();
    setModal(false);
  }

  function resetForm() {
    setType('Invoice');
    setStatus('Outstanding');
    setSupplier('');
    setDesc('');
    setCategory('Other');
    setDate(new Date().toISOString().slice(0, 10));
    setNet('');
    setVatRate('20%');
    setDue('');
    setRef('');
  }

  function deleteFinance(idx: number) {
    if (!confirm('Delete this record?')) return;
    persist({ ...db, finance: finance.filter((_, i) => i !== idx) });
  }

  function markPaid(idx: number) {
    const updated = [...finance];
    updated[idx].status = 'Paid';
    persist({ ...db, finance: updated });
  }

  function exportCSV() {
    const headers = ['Type', 'Status', 'Supplier', 'Description', 'Category', 'Date', 'Net', 'VAT', 'Gross', 'Due', 'Ref'];
    const rows = filtered.map(f => [f.type, f.status, f.supplier, f.desc, f.category, f.date, f.net, f.vat, f.gross, f.due, f.ref]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
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

    setScanFile(file);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64 = (ev.target?.result as string).split(',')[1];
        const ext = file.name.split('.').pop()?.toLowerCase();
        const mediaType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-opus-4-5',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: [{
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 }
              }, {
                type: 'text',
                text: 'Extract from this invoice: supplier/vendor name, invoice date (YYYY-MM-DD format), net amount, VAT amount, total/gross amount. Format as JSON with keys: supplier, date, net, vat, gross.'
              }]
            }]
          })
        });

        if (!response.ok) {
          alert('Scan failed: ' + (await response.text()));
          return;
        }

        const data = await response.json();
        const text = data.content[0]?.text || '';
        try {
          const match = text.match(/\{[\s\S]*\}/);
          const extracted = JSON.parse(match?.[0] || '{}');
          setSupplier(extracted.supplier || '');
          setDate(extracted.date || new Date().toISOString().slice(0, 10));
          setNet(String(extracted.net || ''));
          setDesc(extracted.desc || '');
          setScanModal(false);
        } catch {
          alert('Could not parse invoice data. Please fill manually.');
        }
      } catch (err) {
        alert('Scan error: ' + String(err));
      }
    };
    reader.readAsDataURL(file);
  }

  const outstandingBills = finance.filter(f => f.type === 'Bill' && f.status === 'Outstanding');
  const outstandingInvoices = finance.filter(f => f.type === 'Invoice' && f.status === 'Outstanding');
  const inputVat = outstandingBills.reduce((a, b) => a + (b.vat || 0), 0);
  const outputVat = outstandingInvoices.reduce((a, b) => a + (b.vat || 0), 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="btn-add" onClick={() => { resetForm(); setModal(true); }}>+ Add invoice/bill</button>
        <button className="btn-primary" onClick={() => setScanModal(true)}>📸 Scan invoice</button>
        <button className="btn-primary" onClick={exportCSV}>📥 Export CSV</button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Outstanding bills</div>
          <div className="metric-value">{outstandingBills.length}</div>
          <div className="metric-sub">{fmtMoney(outstandingBills.reduce((a, b) => a + (b.gross || 0), 0))}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Outstanding invoices</div>
          <div className="metric-value">{outstandingInvoices.length}</div>
          <div className="metric-sub">{fmtMoney(outstandingInvoices.reduce((a, b) => a + (b.gross || 0), 0))}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Input VAT</div>
          <div className="metric-value">{fmtMoney(inputVat)}</div>
          <div className="metric-sub">reclaimable</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Output VAT</div>
          <div className="metric-value">{fmtMoney(outputVat)}</div>
          <div className="metric-sub">payable</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <option value="all">All types</option>
          <option value="bill">Bills</option>
          <option value="invoice">Invoices</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <option value="all">All status</option>
          <option value="Outstanding">Outstanding</option>
          <option value="Paid">Paid</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="card-title">Invoices & bills</div>
        {filtered.length === 0
          ? <div className="empty">No records match filters.</div>
          : filtered.map((f, i) => (
            <div key={i} className="row-item">
              <div style={{ flex: 1 }}>
                <div className="row-name">{f.supplier}</div>
                <div className="row-sub">{f.desc} · {fmtDate(f.date)} · {fmtMoney(f.gross)}</div>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span className={`badge ${f.status === 'Outstanding' ? 'bg-amber' : 'bg-green'}`} style={{ fontSize: 10 }}>{f.status}</span>
                <span className="badge bg-blue" style={{ fontSize: 10 }}>{f.category}</span>
                {f.status === 'Outstanding' && <button className="done-btn" onClick={() => markPaid(i)}>Paid</button>}
                <button className="del-btn" onClick={() => deleteFinance(i)}>×</button>
              </div>
            </div>
          ))
        }
      </div>

      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Add invoice/bill</div>
            <div className="field-row">
              <label className="form-label">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option>Invoice</option>
                <option>Bill</option>
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
              <label className="form-label">Supplier</label>
              <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
            </div>
            <div className="field-row">
              <label className="form-label">Description</label>
              <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was purchased" />
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
              <label className="form-label">VAT amount (£)</label>
              <input type="number" value={vatAmount.toFixed(2)} disabled style={{ background: 'var(--bg-secondary)' }} />
            </div>
            <div className="field-row">
              <label className="form-label">Gross amount (£)</label>
              <input type="number" value={gross.toFixed(2)} disabled style={{ background: 'var(--bg-secondary)' }} />
            </div>
            <div className="field-row">
              <label className="form-label">Due date</label>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="form-label">Reference number</label>
              <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice/bill number" />
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={saveFinance}>Add</button>
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scanModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setScanModal(false)}>
          <div className="modal-box">
            <div className="modal-title">Scan invoice</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>Upload a photo or PDF of an invoice. We'll extract the details and prefill the form.</p>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleScanUpload}
              style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
            />
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setScanModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
