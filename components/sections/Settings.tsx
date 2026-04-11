'use client';

import { useState, useEffect } from 'react';
import { FarmData, CloudConfig } from '@/lib/types';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  cfg: CloudConfig | null;
  lastSynced: string;
  onConnect: (url: string, key: string) => Promise<boolean>;
  onDisconnect: () => void;
  onSyncNow: () => void;
}

export default function Settings({ cfg, lastSynced, onConnect, onDisconnect, onSyncNow, db }: Props) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('uaf_anthropic_key') || '';
      setApiKey(saved);
    }
  }, []);

  async function handleConnect() {
    if (!url.trim() || !key.trim()) return alert('Enter both URL and key');
    setLoading(true);
    const success = await onConnect(url, key);
    setLoading(false);
    if (success) {
      setUrl('');
      setKey('');
    }
  }

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
        <div className="card-title">Cloud Sync</div>
        {cfg
          ? <>
            <div className="row-item">
              <div className="row-name">Connected</div>
              <span className="badge bg-green">Synced</span>
            </div>
            <div className="row-item">
              <div className="row-name">Database URL</div>
              <div className="row-sub" style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{cfg.url}</div>
            </div>
            {lastSynced && (
              <div className="row-item">
                <div className="row-name">Last synced</div>
                <div className="row-sub">{lastSynced}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button className="btn-primary" onClick={onSyncNow}>Sync now</button>
              <button className="btn-cancel" onClick={onDisconnect}>Disconnect</button>
            </div>
          </>
          : <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Connect to Supabase for cloud sync and backup.
            </p>
            <div className="field-row">
              <label className="form-label">Supabase URL</label>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="field-row">
              <label className="form-label">API Key</label>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Your key" />
            </div>
            <button className="btn-primary" onClick={handleConnect} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect cloud sync'}
            </button>
          </>
        }
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
