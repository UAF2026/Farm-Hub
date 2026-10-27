'use client';

import { useState, useEffect } from 'react';
import { FarmData, InvoiceSettings } from '@/lib/types';

interface Props {
  db: FarmData;
  persist: (newDb: FarmData) => void;
  lastSynced: string;
  onSyncNow: () => void;
  onLogout: () => void;
}

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  businessName: 'M J Hunt & Son',
  address: 'Upper Assendon Farm\nAssendon\nHenley-on-Thames\nOxfordshire\nRG9 6AU',
  vatNumber: '',
  bankName: '',
  accountName: 'M J Hunt & Son',
  sortCode: '',
  accountNumber: '',
  paymentTerms: '30 days from invoice date',
  invoicePrefix: 'UAF',
  nextInvoiceNumber: 1,
};

export default function Settings({ lastSynced, onSyncNow, onLogout, db, persist }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Invoice settings state
  const inv = db.invoiceSettings ?? DEFAULT_INVOICE_SETTINGS;
  const [invBusinessName, setInvBusinessName] = useState(inv.businessName);
  const [invAddress, setInvAddress] = useState(inv.address);
  const [invVatNumber, setInvVatNumber] = useState(inv.vatNumber);
  const [invBankName, setInvBankName] = useState(inv.bankName);
  const [invAccountName, setInvAccountName] = useState(inv.accountName);
  const [invSortCode, setInvSortCode] = useState(inv.sortCode);
  const [invAccountNumber, setInvAccountNumber] = useState(inv.accountNumber);
  const [invPaymentTerms, setInvPaymentTerms] = useState(inv.paymentTerms);
  const [invPrefix, setInvPrefix] = useState(inv.invoicePrefix);
  const [invSaved, setInvSaved] = useState(false);

  function saveInvoiceSettings() {
    const updated: InvoiceSettings = {
      businessName: invBusinessName.trim(),
      address: invAddress.trim(),
      vatNumber: invVatNumber.trim(),
      bankName: invBankName.trim(),
      accountName: invAccountName.trim(),
      sortCode: invSortCode.trim(),
      accountNumber: invAccountNumber.trim(),
      paymentTerms: invPaymentTerms.trim(),
      invoicePrefix: invPrefix.trim() || 'UAF',
      nextInvoiceNumber: db.invoiceSettings?.nextInvoiceNumber ?? 1,
    };
    persist({ ...db, invoiceSettings: updated });
    setInvSaved(true);
    setTimeout(() => setInvSaved(false), 2000);
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('uaf_anthropic_key') || '';
      setApiKey(saved);
    }
  }, []);



  function saveApiKey() {
    localStorage.setItem('uaf_anthropic_key', apiKey);
    alert('API key saved locally');
  }

  function exportBackup() {
    const json = JSON.stringify(db, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `farm-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Data and login</div>
        <div className="row-item">
          <div className="row-name">Saved to the Hub’s secure database</div>
          <span className="badge bg-green">Logged in</span>
        </div>
        {lastSynced && (
          <div className="row-item">
            <div className="row-name">Last saved</div>
            <div className="row-sub">{lastSynced}</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
          <button className="btn-primary" onClick={onSyncNow}>Save now</button>
          <button className="btn-cancel" onClick={onLogout}>Log out of this device</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Anthropic API Key</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Save your API key to use the farm assistant and scan invoices.
        </p>
        <div className="field-row">
          <label className="form-label">API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer'
              }}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button className="btn-primary" onClick={saveApiKey} style={{ marginTop: '0.5rem' }}>
          Save API key
        </button>
      </div>

      <div className="card">
        <div className="card-title">Invoice Settings</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
          These details appear on every invoice you generate. Bank details and VAT number are printed at the bottom — fill them in once and they're always there.
        </p>
        <div className="field-row">
          <label className="form-label">Business name</label>
          <input type="text" value={invBusinessName} onChange={e => setInvBusinessName(e.target.value)} placeholder="M J Hunt & Son" />
        </div>
        <div className="field-row">
          <label className="form-label">Address</label>
          <textarea value={invAddress} onChange={e => setInvAddress(e.target.value)} rows={4} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, resize: 'vertical' }} />
        </div>
        <div className="field-row">
          <label className="form-label">VAT number</label>
          <input type="text" value={invVatNumber} onChange={e => setInvVatNumber(e.target.value)} placeholder="GB 123 4567 89" />
        </div>
        <div className="field-row">
          <label className="form-label">Bank name</label>
          <input type="text" value={invBankName} onChange={e => setInvBankName(e.target.value)} placeholder="Barclays" />
        </div>
        <div className="field-row">
          <label className="form-label">Account name</label>
          <input type="text" value={invAccountName} onChange={e => setInvAccountName(e.target.value)} placeholder="M J Hunt & Son" />
        </div>
        <div className="field-row">
          <label className="form-label">Sort code</label>
          <input type="text" value={invSortCode} onChange={e => setInvSortCode(e.target.value)} placeholder="20-00-00" />
        </div>
        <div className="field-row">
          <label className="form-label">Account number</label>
          <input type="text" value={invAccountNumber} onChange={e => setInvAccountNumber(e.target.value)} placeholder="12345678" />
        </div>
        <div className="field-row">
          <label className="form-label">Payment terms</label>
          <input type="text" value={invPaymentTerms} onChange={e => setInvPaymentTerms(e.target.value)} placeholder="30 days from invoice date" />
        </div>
        <div className="field-row">
          <label className="form-label">Invoice prefix</label>
          <input type="text" value={invPrefix} onChange={e => setInvPrefix(e.target.value)} placeholder="UAF" style={{ maxWidth: 100 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>e.g. UAF → UAF-001, UAF-002…</span>
        </div>
        <button className="btn-primary" onClick={saveInvoiceSettings} style={{ marginTop: '0.5rem' }}>
          {invSaved ? '✓ Saved' : 'Save invoice settings'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">Backup & Export</div>
        <button className="btn-primary" onClick={exportBackup}>
          Download JSON backup
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Exports all data as JSON for manual backup or transfer.
        </p>
      </div>

      <div className="card">
        <div className="card-title">About</div>
        <div className="row-item">
          <div className="row-name">Farm Hub</div>
          <div className="row-sub">v2.0</div>
        </div>
        <div className="row-item">
          <div className="row-name">Farm</div>
          <div className="row-sub">M J Hunt & Son</div>
        </div>
        <div className="row-item">
          <div className="row-name">SBI</div>
          <div className="row-sub">106227532</div>
        </div>
      </div>
    </>
  );
}
