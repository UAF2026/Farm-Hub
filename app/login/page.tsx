'use client';

import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    fetch('/api/login').then(r => r.json()).then(j => setConfigured(!!j.configured)).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (res.ok) { window.location.href = '/'; return; }
    const j = await res.json().catch(() => ({}));
    setError(j.error || 'Could not log in');
    setBusy(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <form onSubmit={submit} className="card hub-form" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)' }}>Upper Assendon Farm Hub</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.25rem' }}>M J Hunt &amp; Son</div>
        {!configured && (
          <div style={{ fontSize: 13, background: '#fdf3e3', padding: 10, borderRadius: 'var(--radius)', marginBottom: 12 }}>
            The login isn’t set up yet. Add <strong>HUB_PASSWORD</strong> in Vercel’s environment variables and redeploy.
          </div>
        )}
        <label className="form-label" htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" autoFocus value={password} onChange={e => setPassword(e.target.value)} />
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={busy || !password} style={{ width: '100%', padding: 11 }}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>You’ll stay logged in on this device for about a year.</div>
      </form>
    </div>
  );
}
