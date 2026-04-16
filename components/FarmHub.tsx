'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FarmData, emptyDb, CloudConfig, DailyBriefing, Task, Finance as FinanceType } from '@/lib/types';
import { fetchFarmData, saveFarmData } from '@/lib/supabase';
import { uid } from '@/lib/utils';
import Header from './Header';
import Nav from './Nav';
import Dashboard from './sections/Dashboard';
import Tasks from './sections/Tasks';
import Livestock from './sections/Livestock';
import Crops from './sections/Crops';
import Finance from './sections/Finance';
import Schemes from './sections/Schemes';
import Farms from './sections/Farms';
import Links from './sections/Links';
import Assistant from './sections/Assistant';
import Medicine from './sections/Medicine';
import Machinery from './sections/Machinery';
import Utilities from './sections/Utilities';
import Compliance from './sections/Compliance';
import FieldMap from './sections/FieldMap';
import Settings from './sections/Settings';

const LS_KEY = 'uaf_v4';
const LS_CFG = 'uaf_supa_v1';

/* ─── Briefing processing helpers ──────────────────────────────────────── */
function parseGBP(s: string): number {
  return parseFloat((s || '').replace(/[£,\s]/g, '')) || 0;
}

function parseNaturalDate(s: string): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return '';
}

function processBriefing(db: FarmData): FarmData {
  const briefing = db.dailyBriefing;
  if (!briefing || briefing.processed) return db;

  const today = new Date().toISOString().slice(0, 10);

  // Build new tasks from action items, skipping any already added from this briefing date
  const existingBriefingTaskIds = new Set(
    db.tasks.filter(t => t.briefingDate === briefing.date).map(t => t.name)
  );
  const newTasks: Task[] = briefing.actionItems
    .filter(item => !existingBriefingTaskIds.has(item.subject))
    .map(item => ({
      id: uid(),
      name: item.subject,
      date: parseNaturalDate(item.deadline || '') || today,
      priority: 'High' as const,
      category: 'Farm Secretary',
      repeat: 'No repeat',
      notes: `From: ${item.from}\n${item.detail}${item.deadline ? `\nDeadline: ${item.deadline}` : ''}`,
      done: false,
      doneDate: null,
      briefingDate: briefing.date,
    }));

  // Build new finance entries from invoices, skipping duplicates by ref+supplier
  const existingRefs = new Set(
    db.finance.filter(f => f.briefingDate === briefing.date).map(f => `${f.supplier}|${f.ref}`)
  );
  const newFinance: FinanceType[] = briefing.invoices
    .filter(inv => !existingRefs.has(`${inv.supplier}|${inv.ref}`))
    .map(inv => {
      const gross = parseGBP(inv.amount);
      return {
        id: uid(),
        type: 'Bill',
        status: 'Outstanding',
        supplier: inv.supplier,
        desc: inv.notes || inv.ref,
        category: 'Farm Secretary',
        date: today,
        net: gross,
        vat: 0,
        gross,
        vatRate: '0%',
        due: parseNaturalDate(inv.due) || '',
        ref: inv.ref,
        amount: gross,
        briefingDate: briefing.date,
      };
    });

  return {
    ...db,
    tasks: [...db.tasks, ...newTasks],
    finance: [...db.finance, ...newFinance],
    dailyBriefing: { ...briefing, processed: true },
  };
}

export type SyncStatus = 'ok' | 'busy' | 'err' | '';
export type Section = 'dashboard' | 'tasks' | 'livestock' | 'map' | 'crops' | 'finance' | 'schemes' | 'farms' | 'links' | 'assistant' | 'medicine' | 'machinery' | 'utilities' | 'compliance' | 'settings';

export default function FarmHub() {
  const [db, setDb] = useState<FarmData>(emptyDb);
  const [section, setSection] = useState<Section>('dashboard');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('');
  const [syncLabel, setSyncLabel] = useState('Local');
  const [cfg, setCfg] = useState<CloudConfig | null>(null);
  const [lastSynced, setLastSynced] = useState('Never');
  const [showSetup, setShowSetup] = useState(false);
  const syncTimer = useRef<NodeJS.Timeout | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FarmData>;
        const merged: FarmData = { ...emptyDb, ...parsed };
        // Ensure all arrays exist
        (['cattle','fields','finance','schemes','activity','tasks','medicine','machinery','utilities','sprays','fertilisers','certificates','checklist'] as (keyof FarmData)[])
          .forEach(k => { if (!Array.isArray(merged[k])) (merged as any)[k] = []; });
        setDb(merged);
      }
    } catch {}

    try {
      const rawCfg = localStorage.getItem(LS_CFG);
      if (rawCfg) {
        const parsedCfg = JSON.parse(rawCfg) as CloudConfig;
        setCfg(parsedCfg);
        // Load from cloud
        setSyncStatus('busy');
        setSyncLabel('Loading...');
        fetchFarmData(parsedCfg.url, parsedCfg.key).then(data => {
          if (data) {
            const merged: FarmData = { ...emptyDb, ...data };
            (['cattle','fields','finance','schemes','activity','tasks','medicine','machinery','utilities','sprays','fertilisers','certificates','checklist'] as (keyof FarmData)[])
              .forEach(k => { if (!Array.isArray(merged[k])) (merged as any)[k] = []; });
            // Auto-process new briefing: add action items → tasks, invoices → finance
            const finalDb = processBriefing(merged);
            setDb(finalDb);
            try { localStorage.setItem(LS_KEY, JSON.stringify(finalDb)); } catch {}
            // If briefing was just processed, sync the updated db back to Supabase
            if (finalDb !== merged) {
              saveFarmData(parsedCfg.url, parsedCfg.key, finalDb).catch(() => {});
            }
          }
          setSyncStatus('ok');
          setSyncLabel('Synced');
        }).catch(() => {
          setSyncStatus('err');
          setSyncLabel('Sync error');
        });
      } else {
        const hasLocal = !!localStorage.getItem(LS_KEY);
        if (!hasLocal) setShowSetup(true);
      }
    } catch {}
  }, []);

  const saveLocal = useCallback((data: FarmData) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
  }, []);

  const syncNow = useCallback(async (data: FarmData, config: CloudConfig) => {
    setSyncStatus('busy');
    setSyncLabel('Syncing...');
    try {
      await saveFarmData(config.url, config.key, data);
      setSyncStatus('ok');
      setSyncLabel('Synced');
      const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setLastSynced('Today at ' + t);
    } catch {
      setSyncStatus('err');
      setSyncLabel('Sync error');
    }
  }, []);

  const persist = useCallback((newDb: FarmData) => {
    setDb(newDb);
    saveLocal(newDb);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setCfg(currentCfg => {
      if (currentCfg) {
        syncTimer.current = setTimeout(() => syncNow(newDb, currentCfg), 2500);
      }
      return currentCfg;
    });
  }, [saveLocal, syncNow]);

  const addActivity = useCallback((msg: string) => {
    setDb(prev => {
      const newActivity = [{ msg, time: new Date().toLocaleDateString('en-GB') }, ...prev.activity].slice(0, 20);
      const newDb = { ...prev, activity: newActivity };
      saveLocal(newDb);
      setCfg(currentCfg => {
        if (currentCfg) {
          if (syncTimer.current) clearTimeout(syncTimer.current);
          syncTimer.current = setTimeout(() => syncNow(newDb, currentCfg), 2500);
        }
        return currentCfg;
      });
      return newDb;
    });
  }, [saveLocal, syncNow]);

  const connectCloud = useCallback(async (url: string, key: string): Promise<boolean> => {
    setSyncStatus('busy');
    setSyncLabel('Connecting...');
    try {
      const existing = await fetchFarmData(url, key);
      const newCfg = { url, key };
      if (existing && existing.cattle && existing.cattle.length > 0) {
        const merged: FarmData = { ...emptyDb, ...existing };
        (['cattle','fields','finance','schemes','activity','tasks','medicine','machinery','utilities','sprays','fertilisers','certificates','checklist'] as (keyof FarmData)[])
          .forEach(k => { if (!Array.isArray(merged[k])) (merged as any)[k] = []; });
        setDb(merged);
        saveLocal(merged);
      } else {
        await saveFarmData(url, key, db);
      }
      setCfg(newCfg);
      try { localStorage.setItem(LS_CFG, JSON.stringify(newCfg)); } catch {}
      setSyncStatus('ok');
      setSyncLabel('Synced');
      setShowSetup(false);
      return true;
    } catch {
      setSyncStatus('err');
      setSyncLabel('Sync error');
      return false;
    }
  }, [db, saveLocal]);

  const disconnectCloud = useCallback(() => {
    setCfg(null);
    try { localStorage.removeItem(LS_CFG); } catch {}
    setSyncStatus('');
    setSyncLabel('Local only');
  }, []);

  return (
    <>
      {showSetup && (
        <SetupScreen
          onConnect={connectCloud}
          onLocalOnly={() => { setShowSetup(false); setSyncLabel('Local only'); }}
        />
      )}
      <Header syncStatus={syncStatus} syncLabel={syncLabel} />
      <Nav section={section} onSection={setSection} />
      <div className="main">
        {section === 'dashboard' && <Dashboard db={db} persist={persist} />}
        {section === 'tasks' && <Tasks db={db} persist={persist} addActivity={addActivity} />}
        {section === 'livestock' && <Livestock db={db} persist={persist} addActivity={addActivity} />}
        {section === 'map' && <FieldMap db={db} persist={persist} addActivity={addActivity} />}
        {section === 'crops' && <Crops db={db} persist={persist} addActivity={addActivity} />}
        {section === 'finance' && <Finance db={db} persist={persist} addActivity={addActivity} />}
        {section === 'schemes' && <Schemes db={db} persist={persist} addActivity={addActivity} />}
        {section === 'farms' && <Farms />}
        {section === 'links' && <Links />}
        {section === 'assistant' && <Assistant db={db} />}
        {section === 'medicine' && <Medicine db={db} persist={persist} addActivity={addActivity} />}
        {section === 'machinery' && <Machinery db={db} persist={persist} addActivity={addActivity} />}
        {section === 'utilities' && <Utilities db={db} persist={persist} addActivity={addActivity} />}
        {section === 'compliance' && <Compliance db={db} persist={persist} addActivity={addActivity} />}
        {section === 'settings' && (
          <Settings
            db={db} persist={persist} cfg={cfg} lastSynced={lastSynced}
            onConnect={connectCloud} onDisconnect={disconnectCloud} onSyncNow={() => cfg && syncNow(db, cfg)}
          />
        )}
      </div>
    </>
  );
}

function SetupScreen({ onConnect, onLocalOnly }: { onConnect: (url: string, key: string) => Promise<boolean>; onLocalOnly: () => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    if (!url || !key) { setError('Please enter both fields.'); return; }
    setLoading(true); setError('');
    const ok = await onConnect(url.trim().replace(/\/$/, ''), key.trim());
    if (!ok) { setError('Could not connect. Check your URL and key.'); setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 999, overflow: 'auto', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 22, color: 'var(--green)', marginBottom: 6 }}>Upper Assendon Farm Hub</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.75rem' }}>M J Hunt &amp; Son</div>
        <div className="card">
          <div className="card-title">Connect cloud storage</div>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '1rem' }}>Enter your Supabase details to sync across all devices.</p>
          <label className="form-label">Project URL</label>
          <input type="text" placeholder="https://xxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} />
          <label className="form-label">Anon public key</label>
          <input type="password" placeholder="eyJ..." value={key} onChange={e => setKey(e.target.value)} style={{ fontFamily: 'monospace' }} />
          {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10, padding: 8, background: '#fcecea', borderRadius: 'var(--radius)' }}>{error}</div>}
          <button className="btn-primary" onClick={handleConnect} disabled={loading} style={{ width: '100%', padding: 11 }}>
            {loading ? 'Connecting...' : 'Connect & load my data'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={onLocalOnly} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}>
              Use on this device only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
