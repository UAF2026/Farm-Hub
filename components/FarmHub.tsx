'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FarmData, emptyDb, DailyBriefing, Task, Finance as FinanceType, GrainMarketPrice } from '@/lib/types';
import { fetchFarmData, saveFarmData, NotLoggedIn } from '@/lib/supabase';
import { uid } from '@/lib/utils';
import Header from './Header';
import Nav, { ALL_SECTIONS, groupOf } from './Nav';
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
import Assurance from './sections/Assurance';
import FieldMap from './sections/FieldMap';
import Settings from './sections/Settings';
import JohnDeere from './sections/JohnDeere';
import SoilHealth from './sections/SoilHealth';
import Agronomy from './sections/Agronomy';
import GrainTrading from './sections/GrainTrading';
import SatelliteNDVI from './sections/SatelliteNDVI';
import BrainDump from './sections/BrainDump';
import Weather from './sections/Weather';
import Fields from './sections/Fields';
import MyDay from './sections/MyDay';
import FarmYear from './sections/FarmYear';
import Diary from './sections/Diary';
import FarmBible from './sections/FarmBible';
import FieldRecords from './sections/FieldRecords';
import Purchases from './sections/Purchases';
import CroppingPlan from './sections/CroppingPlan';
import Costings from './sections/Costings';
import Strategy from './sections/Strategy';

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
      // Prefer the structured numeric fields if the skill provided them;
      // otherwise parse the legacy "amount" string (e.g. "£1,234.56").
      const gross = inv.gross ?? parseGBP(inv.amount);
      const net = inv.net ?? gross;
      const vat = inv.vat ?? Math.max(0, gross - net);
      const invoiceDate = inv.invoiceDate || today;
      return {
        id: uid(),
        type: 'Bill',
        status: 'Outstanding',
        supplier: inv.supplier,
        desc: inv.notes || inv.ref,
        category: inv.category || 'Farm Secretary',
        date: invoiceDate,
        net,
        vat,
        gross,
        vatRate: inv.vatRate || (vat > 0 ? '20%' : '0%'),
        due: parseNaturalDate(inv.due) || '',
        ref: inv.ref,
        amount: gross,
        briefingDate: briefing.date,
      };
    });

  // Apply grain prices from price report emails (Openfield, ADM, etc.)
  let updatedGrainTrading = db.grainTrading;
  if (briefing.grainPrices && briefing.grainPrices.length > 0) {
    const newMarketPrices: GrainMarketPrice[] = briefing.grainPrices.map(gp => ({
      contract: gp.contract,
      pricePerTonne: gp.pricePerTonne,
      fetchedAt: briefing.generatedAt,
      source: gp.source,
    }));
    updatedGrainTrading = {
      ...(db.grainTrading ?? { positions: [] }),
      marketPrices: newMarketPrices,
      lastMarketFetch: briefing.generatedAt,
    };
  }

  return {
    ...db,
    tasks: [...db.tasks, ...newTasks],
    finance: [...db.finance, ...newFinance],
    grainTrading: updatedGrainTrading,
    dailyBriefing: { ...briefing, processed: true },
  };
}

export type SyncStatus = 'ok' | 'busy' | 'err' | '';
export type Section = 'myday' | 'farmyear' | 'dashboard' | 'weather' | 'fields' | 'strategy' | 'tasks' | 'livestock' | 'map' | 'crops' | 'soilhealth' | 'agronomy' | 'finance' | 'schemes' | 'graintrading' | 'satellite' | 'farms' | 'links' | 'assistant' | 'medicine' | 'machinery' | 'utilities' | 'compliance' | 'assurance' | 'johndeere' | 'braindump' | 'farmbible' | 'fieldrecords' | 'purchases' | 'croppingplan' | 'costings' | 'diary' | 'settings';

export default function FarmHub() {
  const [db, setDb] = useState<FarmData>(emptyDb);
  const [section, setSectionState] = useState<Section>('myday');
  const [lastInGroup, setLastInGroup] = useState<Record<string, Section>>({});

  // The open tab lives in the address (#fields, #finance…) so refresh and the
  // phone's back button keep your place.
  const setSection = useCallback((s: Section) => {
    setSectionState(s);
    const g = groupOf(s);
    if (g) setLastInGroup(prev => ({ ...prev, [g.id]: s }));
    if (typeof window !== 'undefined' && window.location.hash.slice(1).split('/')[0] !== s) window.history.pushState(null, '', `#${s}`);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const fromHash = () => {
      // '#fields/borderleys' opens a field page; the part after '/' belongs to that tab.
      const h = window.location.hash.slice(1).split('/')[0] as Section;
      if (ALL_SECTIONS.includes(h)) {
        setSectionState(h);
        const g = groupOf(h);
        if (g) setLastInGroup(prev => ({ ...prev, [g.id]: h }));
      } else if (!h) setSectionState('myday');
    };
    fromHash();
    window.addEventListener('popstate', fromHash);
    window.addEventListener('hashchange', fromHash);
    return () => { window.removeEventListener('popstate', fromHash); window.removeEventListener('hashchange', fromHash); };
  }, []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('');
  const [syncLabel, setSyncLabel] = useState('Loading…');
  const [lastSynced, setLastSynced] = useState('Never');
  const syncTimer = useRef<NodeJS.Timeout | null>(null);

  const toLogin = () => { window.location.href = '/login'; };

  // Show the cached copy straight away, then load the latest from the server.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FarmData>;
        const merged: FarmData = { ...emptyDb, ...parsed };
        (['cattle','fields','finance','schemes','activity','tasks','medicine','machinery','utilities','sprays','fertilisers','certificates','checklist'] as (keyof FarmData)[])
          .forEach(k => { if (!Array.isArray(merged[k])) (merged as any)[k] = []; });
        setDb(merged);
      }
    } catch {}
    try { localStorage.removeItem(LS_CFG); } catch {}   // old direct-to-Supabase settings, no longer used

    setSyncStatus('busy');
    setSyncLabel('Loading…');
    fetchFarmData().then(data => {
      if (data) {
        const merged: FarmData = { ...emptyDb, ...data };
        (['cattle','fields','finance','schemes','activity','tasks','medicine','machinery','utilities','sprays','fertilisers','certificates','checklist'] as (keyof FarmData)[])
          .forEach(k => { if (!Array.isArray(merged[k])) (merged as any)[k] = []; });
        // Auto-process new briefing: add action items → tasks, invoices → finance
        const finalDb = processBriefing(merged);
        setDb(finalDb);
        try { localStorage.setItem(LS_KEY, JSON.stringify(finalDb)); } catch {}
        if (finalDb !== merged) saveFarmData(finalDb).catch(() => {});
      }
      setSyncStatus('ok');
      setSyncLabel('Synced');
    }).catch(err => {
      if (err instanceof NotLoggedIn) return toLogin();
      setSyncStatus('err');
      setSyncLabel('Sync error');
    });
  }, []);

  const saveLocal = useCallback((data: FarmData) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
  }, []);

  const syncNow = useCallback(async (data: FarmData) => {
    setSyncStatus('busy');
    setSyncLabel('Syncing...');
    try {
      await saveFarmData(data);
      setSyncStatus('ok');
      setSyncLabel('Synced');
      const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setLastSynced('Today at ' + t);
    } catch (err) {
      if (err instanceof NotLoggedIn) return toLogin();
      setSyncStatus('err');
      setSyncLabel('Sync error');
    }
  }, []);

  const scheduleSync = useCallback((data: FarmData) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => syncNow(data), 2500);
  }, [syncNow]);

  const persist = useCallback((newDb: FarmData) => {
    setDb(newDb);
    saveLocal(newDb);
    scheduleSync(newDb);
  }, [saveLocal, scheduleSync]);

  const addActivity = useCallback((msg: string) => {
    setDb(prev => {
      const newActivity = [{ msg, time: new Date().toLocaleDateString('en-GB') }, ...prev.activity].slice(0, 20);
      const newDb = { ...prev, activity: newActivity };
      saveLocal(newDb);
      scheduleSync(newDb);
      return newDb;
    });
  }, [saveLocal, scheduleSync]);

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    try { localStorage.removeItem(LS_KEY); } catch {}
    toLogin();
  }, []);

  return (
    <>
      <Header syncStatus={syncStatus} syncLabel={syncLabel} onSettings={() => setSection('settings')} settingsOpen={section === 'settings'} />
      <Nav section={section} onSection={setSection} lastInGroup={lastInGroup} />
      <div className="main">
        {section === 'dashboard' && <Dashboard db={db} persist={persist} onNavigate={setSection} />}
        {section === 'myday' && <MyDay db={db} persist={persist} addActivity={addActivity} />}
        {section === 'farmyear' && <FarmYear db={db} persist={persist} addActivity={addActivity} />}
        {section === 'weather' && <Weather />}
        {section === 'fields' && <Fields db={db} persist={persist} addActivity={addActivity} />}
        {section === 'strategy' && <Strategy db={db} persist={persist} onNavigate={setSection} />}
        {section === 'tasks' && <Tasks db={db} persist={persist} addActivity={addActivity} />}
        {section === 'livestock' && <Livestock db={db} persist={persist} addActivity={addActivity} />}
        {section === 'map' && <FieldMap db={db} />}
        {section === 'crops' && <Crops db={db} persist={persist} addActivity={addActivity} />}
        {section === 'soilhealth' && <SoilHealth db={db} persist={persist} addActivity={addActivity} />}
        {section === 'agronomy' && <Agronomy db={db} persist={persist} addActivity={addActivity} />}
        {section === 'finance' && <Finance db={db} persist={persist} addActivity={addActivity} />}
        {section === 'schemes' && <Schemes db={db} persist={persist} addActivity={addActivity} />}
        {section === 'graintrading' && <GrainTrading db={db} persist={persist} addActivity={addActivity} />}
        {section === 'satellite' && <SatelliteNDVI db={db} />}
        {section === 'farms' && <Farms />}
        {section === 'links' && <Links />}
        {section === 'braindump' && <BrainDump db={db} persist={persist} addActivity={addActivity} />}
        {section === 'diary' && <Diary db={db} persist={persist} addActivity={addActivity} />}
        {section === 'farmbible' && <FarmBible db={db} persist={persist} />}
        {section === 'fieldrecords' && <FieldRecords db={db} persist={persist} />}
        {section === 'purchases' && <Purchases db={db} persist={persist} />}
        {section === 'croppingplan' && <CroppingPlan db={db} persist={persist} />}
        {section === 'costings' && <Costings db={db} persist={persist} />}
        {section === 'assistant' && <Assistant db={db} />}
        {section === 'medicine' && <Medicine db={db} persist={persist} addActivity={addActivity} />}
        {section === 'machinery' && <Machinery db={db} persist={persist} addActivity={addActivity} />}
        {section === 'utilities' && <Utilities db={db} persist={persist} addActivity={addActivity} />}
        {section === 'compliance' && <Compliance db={db} persist={persist} addActivity={addActivity} />}
        {section === 'assurance' && <Assurance db={db} />}
        {section === 'johndeere' && <JohnDeere db={db} persist={persist} />}
        {section === 'settings' && (
          <Settings
            db={db} persist={persist} lastSynced={lastSynced}
            onSyncNow={() => syncNow(db)} onLogout={logout}
          />
        )}
      </div>
    </>
  );
}
