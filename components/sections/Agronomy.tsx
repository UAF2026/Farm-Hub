'use client';

import { useState, useMemo } from 'react';
import { FarmData, AgronomyVisit, AgronomyJob, AgronomyJobField, AgronomyProduct, JdOperation } from '@/lib/types';
import { uid } from '@/lib/utils';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
  addActivity: (msg: string) => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isoToDisplay(ddmmyyyy: string): string {
  // Convert DD/MM/YYYY to YYYY-MM-DD
  const parts = ddmmyyyy.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  return ddmmyyyy;
}

function jobStatus(job: AgronomyJob, issueDate: string): 'all-applied' | 'partial' | 'pending' | 'overdue' {
  const fields = job.fields;
  if (!fields.length) return 'pending';
  const applied = fields.filter(f => f.status === 'applied').length;
  const today = new Date().toISOString().slice(0, 10);
  const deadline = job.latestDate || '';
  if (applied === fields.length) return 'all-applied';
  if (applied > 0) return 'partial';
  if (deadline && today > deadline) return 'overdue';
  return 'pending';
}

function statusBadge(status: string) {
  const cfg: Record<string, { bg: string; label: string }> = {
    'all-applied': { bg: 'bg-green', label: '✓ Applied' },
    'partial':     { bg: 'bg-amber', label: '~ Partial' },
    'pending':     { bg: 'bg-blue',  label: '· Pending' },
    'overdue':     { bg: 'bg-red',   label: '! Overdue' },
    'applied':     { bg: 'bg-green', label: '✓ Applied' },
    'skipped':     { bg: '',         label: 'Skipped'   },
  };
  const c = cfg[status] || { bg: 'bg-blue', label: status };
  return <span className={`badge ${c.bg}`}>{c.label}</span>;
}

/* ─── JD Ops matching ───────────────────────────────────────────────────── */
function findMatchingJdOps(field: string, job: AgronomyJob, jdOps: JdOperation[]): JdOperation[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fieldNorm = norm(field);
  const window = { from: job.earliestDate || '', to: job.latestDate || '' };
  return jdOps.filter(op => {
    if (op.type !== 'application') return false;
    if (norm(op.fieldName) !== fieldNorm) return false;
    if (window.from && op.startDate < window.from) return false;
    if (window.to && op.startDate > window.to) return false;
    return true;
  });
}

/* ─── Parse Gatekeeper PDF text ─────────────────────────────────────────── */
function parseGatekeeperText(text: string, reportNo: string, issueDateRaw: string): AgronomyVisit | null {
  try {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const issueDate = isoToDisplay(issueDateRaw);
    const jobs: AgronomyJob[] = [];

    // Find all job blocks
    const jobStarts: number[] = [];
    lines.forEach((l, i) => { if (/^Job \d+\s+Total job area/.test(l)) jobStarts.push(i); });

    for (let ji = 0; ji < jobStarts.length; ji++) {
      const start = jobStarts[ji];
      const end = ji + 1 < jobStarts.length ? jobStarts[ji + 1] : lines.length;
      const block = lines.slice(start, end);

      // Header: "Job 1 Total job area: 38.20 ha"
      const headerMatch = block[0].match(/^Job (\d+)\s+Total job area:\s*([\d.]+)\s*ha/);
      if (!headerMatch) continue;
      const jobNumber = parseInt(headerMatch[1]);
      const totalAreaHa = parseFloat(headerMatch[2]);

      // Reason / Comment
      let reason = '';
      let comment = '';
      for (const l of block) {
        const rm = l.match(/^Reason:(.*?)(?:Comment:(.*))?$/);
        if (rm) { reason = rm[1].trim(); comment = (rm[2] || '').trim(); break; }
      }

      // Fields section — between "Fields Job N" header and "Products Job N"
      const fieldsHeaderIdx = block.findIndex(l => /^Fields Job \d+/.test(l));
      const productsHeaderIdx = block.findIndex(l => /^Products Job \d+/.test(l));
      const opRecordsIdx = block.findIndex(l => /^Operator Records Job \d+/.test(l));

      const fields: AgronomyJobField[] = [];
      if (fieldsHeaderIdx >= 0 && productsHeaderIdx > fieldsHeaderIdx) {
        // Skip the column header line "Fields Job N  Area ha  Crop  Variety  Growth Stage"
        for (let i = fieldsHeaderIdx + 2; i < productsHeaderIdx; i++) {
          const l = block[i];
          // Format: "Lodge big 15.00 Wheat Spring Wheat Spring 22, 2 Tillers"
          const fm = l.match(/^(.+?)\s+([\d.]+)\s+(\w+)\s+(.+)$/);
          if (fm) {
            const name = fm[1].trim();
            const areaHa = parseFloat(fm[2]);
            const crop = fm[3].trim();
            // Variety + growth stage are merged — split on last known GS pattern
            const rest = fm[4].trim();
            const gsMatch = rest.match(/^(.*?)\s+(\d+[:, ].+)$/);
            const variety = gsMatch ? gsMatch[1].trim() : rest;
            const growthStage = gsMatch ? gsMatch[2].trim() : undefined;
            if (name && areaHa) fields.push({ name, areaHa, crop, variety: variety || undefined, growthStage, status: 'pending' });
          }
        }
      }

      // Products section — between "Products Job N" header and "Operator Records"
      const products: AgronomyProduct[] = [];
      let waterVolume: number | undefined;
      let earliestDate: string | undefined;
      let latestDate: string | undefined;
      let earliestGS: string | undefined;
      let latestGS: string | undefined;
      let sprayQuality: string | undefined;

      if (productsHeaderIdx >= 0) {
        const prodEnd = opRecordsIdx > productsHeaderIdx ? opRecordsIdx : block.length;
        // Application rate line
        const appLine = block[productsHeaderIdx + 1] || '';
        const wvMatch = appLine.match(/Application rate:\s*([\d.]+)\s*L/);
        if (wvMatch) waterVolume = parseFloat(wvMatch[1]);
        const earlyDateM = appLine.match(/Earliest application:\s*([\d/]+)/);
        if (earlyDateM) earliestDate = isoToDisplay(earlyDateM[1]);
        const lateDateM = appLine.match(/Latest application:\s*([\d/]+)/);
        if (lateDateM) latestDate = isoToDisplay(lateDateM[1]);
        const earlyGSM = appLine.match(/Earliest growth stage:\s*([^,]+)/);
        if (earlyGSM) earliestGS = earlyGSM[1].trim();
        const lateGSM = appLine.match(/Latest growth stage:\s*([^,S]+)/);
        if (lateGSM) latestGS = lateGSM[1].trim();
        const sqM = appLine.match(/Spray quality:\s*(\w+)/);
        if (sqM) sprayQuality = sqM[1];

        // Each product: "ProductName (MAPP) rate total unit % lerap"
        for (let i = productsHeaderIdx + 2; i < prodEnd; i++) {
          const l = block[i];
          // "Jessico One (20475) 1.000 58.080 L 50 *"
          const pm = l.match(/^(.+?)\s*\((\d+)\)\s+([\d.]+)\s+([\d.]+)\s+(\w+)\s+(\S+)(?:\s+(\S+))?/);
          if (pm) {
            products.push({
              name: pm[1].trim(),
              mappNo: pm[2],
              ratePerHa: parseFloat(pm[3]),
              totalRequired: parseFloat(pm[4]),
              unit: pm[5],
              lerap: pm[7] || pm[6],
            });
          }
          // MAPP line gives active ingredients
          const mappLine = l.match(/^MAPP:(\d+),\s*Active Ingredients:\s*([^,E]+)/);
          if (mappLine && products.length > 0) {
            const last = products[products.length - 1];
            if (last.mappNo === mappLine[1]) last.activeIngredients = mappLine[2].trim();
            const expiryM = l.match(/Expires:([\d/]+)/);
            if (expiryM && last.mappNo === mappLine[1]) last.expiryDate = isoToDisplay(expiryM[1]);
          }
        }
      }

      jobs.push({
        id: uid(),
        jobNumber,
        reason,
        comment,
        totalAreaHa,
        fields,
        products,
        waterVolume,
        earliestDate,
        latestDate,
        earliestGrowthStage: earliestGS,
        latestGrowthStage: latestGS,
        sprayQuality,
      });
    }

    // Advisor / basisFacts from header
    const advisorLine = lines.find(l => l.startsWith('Advisor:'));
    const advisor = advisorLine ? advisorLine.replace('Advisor:', '').trim() : 'Luke Cotton';
    const basisLine = lines.find(l => /^Basis \/ Facts/.test(l));
    const basisFacts = basisLine ? basisLine.replace(/^Basis \/ Facts\s*/, '').trim() : undefined;

    return {
      id: reportNo,
      reportNo,
      issueDate,
      advisor,
      basisFacts,
      jobs,
      source: 'gatekeeper',
    };
  } catch {
    return null;
  }
}

/* ─── Empty forms ────────────────────────────────────────────────────────── */
const EMPTY_VISIT_FORM = { reportNo: '', issueDate: new Date().toISOString().slice(0, 10), advisor: 'Luke Cotton', notes: '' };

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function Agronomy({ db, persist, addActivity }: Props) {
  const visits: AgronomyVisit[] = db.agronomyVisits || [];
  const jdOps: JdOperation[] = db.jdOperations || [];

  const [view, setView] = useState<'visits' | 'actions' | 'jdmatch'>('visits');
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importReportNo, setImportReportNo] = useState('');
  const [importDate, setImportDate] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [filterField, setFilterField] = useState('');

  /* ─── Derived data ───────────────────────────────────────────────────── */
  const allFieldNames = useMemo(() => {
    const seen: Record<string, boolean> = {};
    const names: string[] = [];
    visits.forEach(v => v.jobs.forEach(j => j.fields.forEach(f => {
      if (!seen[f.name]) { seen[f.name] = true; names.push(f.name); }
    })));
    return names.sort();
  }, [visits]);

  // All pending/overdue jobs across all visits
  const pendingJobs = useMemo(() => {
    const result: { visit: AgronomyVisit; job: AgronomyJob; status: string }[] = [];
    visits.forEach(v => {
      v.jobs.forEach(j => {
        const s = jobStatus(j, v.issueDate);
        if (s !== 'all-applied') result.push({ visit: v, job: j, status: s });
      });
    });
    return result.sort((a, b) => {
      // overdue first, then partial, then pending
      const order = { overdue: 0, partial: 1, pending: 2, 'all-applied': 3 };
      return (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2);
    });
  }, [visits]);

  // JD match: for each pending job field, find matching JD operations
  const jdMatches = useMemo(() => {
    const results: {
      visit: AgronomyVisit;
      job: AgronomyJob;
      field: AgronomyJobField;
      matched: JdOperation[];
    }[] = [];
    visits.forEach(v => {
      v.jobs.forEach(j => {
        j.fields.forEach(f => {
          const matched = findMatchingJdOps(f.name, j, jdOps);
          if (matched.length > 0) results.push({ visit: v, job: j, field: f, matched });
        });
      });
    });
    return results;
  }, [visits, jdOps]);

  /* ─── Actions ────────────────────────────────────────────────────────── */
  function markFieldApplied(visitId: string, jobId: string, fieldName: string, applied: boolean) {
    const updated = visits.map(v => {
      if (v.id !== visitId) return v;
      return {
        ...v,
        jobs: v.jobs.map(j => {
          if (j.id !== jobId) return j;
          return {
            ...j,
            fields: j.fields.map(f => {
              if (f.name !== fieldName) return f;
              return { ...f, status: (applied ? 'applied' : 'pending') as AgronomyJobField['status'], appliedDate: applied ? new Date().toISOString().slice(0, 10) : undefined };
            }),
          };
        }),
      };
    });
    persist({ ...db, agronomyVisits: updated });
    addActivity(`Marked ${fieldName} as ${applied ? 'applied' : 'pending'} — ${jobId}`);
  }

  function deleteVisit(id: string) {
    if (!confirm('Delete this agronomy visit?')) return;
    persist({ ...db, agronomyVisits: visits.filter(v => v.id !== id) });
    addActivity(`Deleted agronomy visit ${id}`);
  }

  async function handleImport() {
    setImportError('');
    if (!importFile) { setImportError('Please select a Gatekeeper PDF file.'); return; }
    if (importReportNo && visits.find(v => v.id === importReportNo)) {
      setImportError(`Report ${importReportNo} already exists.`);
      return;
    }
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('pdf', importFile);
      if (importReportNo) fd.append('reportNo', importReportNo);
      if (importDate) fd.append('issueDate', importDate);

      const res = await fetch('/api/gatekeeper', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.error) {
        setImportError(json.error || 'Parse failed.');
        return;
      }
      const visit = json.visit;
      const id = visit.reportNo || importReportNo;
      persist({ ...db, agronomyVisits: [...visits, { ...visit, id }].sort((a: AgronomyVisit, b: AgronomyVisit) => b.issueDate.localeCompare(a.issueDate)) });
      addActivity(`Imported Gatekeeper report ${id} — ${visit.jobs.length} jobs, ${visit.jobs.reduce((n: number, j: AgronomyJob) => n + j.fields.length, 0)} fields`);
      setShowImportModal(false);
      setImportFile(null);
      setImportReportNo('');
      setImportDate('');
      setExpandedVisit(id);
    } catch (e) {
      setImportError('Upload failed: ' + String(e));
    } finally {
      setImportLoading(false);
    }
  }

  /* ─── Stats ──────────────────────────────────────────────────────────── */
  const totalJobs = visits.reduce((n, v) => n + v.jobs.length, 0);
  const appliedJobs = visits.reduce((n, v) => n + v.jobs.filter(j => jobStatus(j, v.issueDate) === 'all-applied').length, 0);
  const overdueJobs = pendingJobs.filter(p => p.status === 'overdue').length;

  /* ─── Filtered field view ────────────────────────────────────────────── */
  const fieldHistory = useMemo(() => {
    if (!filterField) return [];
    const results: { visit: AgronomyVisit; job: AgronomyJob; field: AgronomyJobField }[] = [];
    visits.forEach(v => v.jobs.forEach(j => j.fields.forEach(f => {
      if (f.name.toLowerCase() === filterField.toLowerCase()) results.push({ visit: v, job: j, field: f });
    })));
    return results.sort((a, b) => b.visit.issueDate.localeCompare(a.visit.issueDate));
  }, [visits, filterField]);

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div>
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 18, color: 'var(--green)', flex: 1 }}>Agronomy</div>
        <button className="btn-add" onClick={() => setShowImportModal(true)}>+ Import Gatekeeper</button>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="metrics-row" style={{ marginBottom: 16 }}>
        <div className="metric-card">
          <div className="metric-label">Visits</div>
          <div className="metric-value">{visits.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Jobs issued</div>
          <div className="metric-value">{totalJobs}</div>
          <div className="metric-sub">{appliedJobs} applied</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Pending</div>
          <div className="metric-value" style={{ color: overdueJobs > 0 ? 'var(--red)' : undefined }}>{pendingJobs.length}</div>
          {overdueJobs > 0 && <div className="metric-sub" style={{ color: 'var(--red)' }}>{overdueJobs} overdue</div>}
        </div>
        <div className="metric-card">
          <div className="metric-label">JD matches</div>
          <div className="metric-value">{jdMatches.length}</div>
          <div className="metric-sub">operations linked</div>
        </div>
      </div>

      {/* ── Sub-nav ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['visits', 'actions', 'jdmatch'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={view === v ? 'btn-primary' : 'btn-cancel'}
            style={{ padding: '5px 14px', fontSize: 13 }}>
            {v === 'visits' ? 'All visits' : v === 'actions' ? `Actions${pendingJobs.length ? ` (${pendingJobs.length})` : ''}` : 'JD Ops match'}
          </button>
        ))}
        {/* Field filter */}
        <div style={{ marginLeft: 'auto' }}>
          <input
            type="text"
            list="agron-fields"
            placeholder="Filter by field…"
            value={filterField}
            onChange={e => setFilterField(e.target.value)}
            style={{ fontSize: 13, padding: '4px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)' }}
          />
          <datalist id="agron-fields">
            {allFieldNames.map(f => <option key={f} value={f} />)}
          </datalist>
          {filterField && <button onClick={() => setFilterField('')} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>✕ clear</button>}
        </div>
      </div>

      {/* ── Field history panel (when filter active) ─────────────────────── */}
      {filterField && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">Field history — {filterField}</div>
          {fieldHistory.length === 0
            ? <div className="empty">No recommendations found for "{filterField}".</div>
            : fieldHistory.map(({ visit, job, field }) => (
              <div key={`${visit.id}-${job.id}`} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {fmtDate(visit.issueDate)}
                    <span style={{ fontWeight: 400, color: '#666' }}>Report {visit.reportNo}</span>
                    {statusBadge(field.status || 'pending')}
                  </div>
                  <div className="row-sub" style={{ marginTop: 3 }}>
                    {job.reason}{job.comment ? ` — ${job.comment}` : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {job.products.map((p, i) => (
                      <span key={i} className="badge bg-blue">{p.name} {p.ratePerHa}{p.unit}/ha</span>
                    ))}
                  </div>
                  {job.latestDate && (
                    <div className="row-sub" style={{ marginTop: 4 }}>
                      Deadline: {fmtDate(job.latestDate)}{job.latestGrowthStage ? ` · GS${job.latestGrowthStage}` : ''}
                    </div>
                  )}
                  {field.appliedDate && (
                    <div className="row-sub" style={{ color: 'var(--green)', marginTop: 2 }}>Applied {fmtDate(field.appliedDate)}</div>
                  )}
                </div>
                <button
                  className={field.status === 'applied' ? 'btn-cancel' : 'btn-primary'}
                  style={{ fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => markFieldApplied(visit.id, job.id, field.name, field.status !== 'applied')}
                >{field.status === 'applied' ? 'Undo' : 'Mark applied'}</button>
              </div>
            ))
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VISITS TAB                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === 'visits' && !filterField && (
        <div>
          {visits.length === 0
            ? <div className="card"><div className="empty">No agronomy visits yet. Click "+ Import Gatekeeper" to add one.</div></div>
            : visits.map(visit => {
              const isOpen = expandedVisit === visit.id;
              const allStatuses = visit.jobs.map(j => jobStatus(j, visit.issueDate));
              const visitDone = allStatuses.every(s => s === 'all-applied');
              const visitOverdue = allStatuses.some(s => s === 'overdue');

              return (
                <div key={visit.id} className="card" style={{ marginBottom: 10 }}>
                  {/* Visit header */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}
                    onClick={() => setExpandedVisit(isOpen ? null : visit.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="row-name" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        Report {visit.reportNo} — {fmtDate(visit.issueDate)}
                        {visitDone
                          ? statusBadge('all-applied')
                          : visitOverdue
                          ? statusBadge('overdue')
                          : <span className="badge bg-blue">· {allStatuses.filter(s => s !== 'all-applied').length} pending</span>
                        }
                      </div>
                      <div className="row-sub" style={{ marginTop: 2 }}>
                        {visit.advisor} · {visit.jobs.length} job{visit.jobs.length !== 1 ? 's' : ''} · {visit.jobs.reduce((n, j) => n + j.fields.length, 0)} fields
                        {visit.basisFacts && <span> · {visit.basisFacts}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="del-btn" onClick={e => { e.stopPropagation(); deleteVisit(visit.id); }}>×</button>
                      <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded jobs */}
                  {isOpen && (
                    <div style={{ marginTop: 12 }}>
                      {visit.notes && (
                        <div style={{ fontSize: 13, color: '#555', background: 'var(--bg-alt)', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                          {visit.notes}
                        </div>
                      )}
                      {visit.jobs.map(job => {
                        const js = jobStatus(job, visit.issueDate);
                        const jobOpen = expandedJob === job.id;
                        return (
                          <div key={job.id} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 12, marginBottom: 10 }}>
                            {/* Job header */}
                            <div
                              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}
                              onClick={() => setExpandedJob(jobOpen ? null : job.id)}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  Job {job.jobNumber} — {job.reason}
                                  {statusBadge(js)}
                                </div>
                                <div className="row-sub" style={{ marginTop: 2 }}>
                                  {job.totalAreaHa} ha · {job.fields.length} field{job.fields.length !== 1 ? 's' : ''}
                                  {job.latestDate && ` · deadline ${fmtDate(job.latestDate)}`}
                                </div>
                                {job.comment && (
                                  <div style={{ fontSize: 12, color: '#e67e00', marginTop: 3 }}>⚠ {job.comment}</div>
                                )}
                              </div>
                              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{jobOpen ? '▲' : '▼'}</span>
                            </div>

                            {/* Job detail */}
                            {jobOpen && (
                              <div style={{ marginTop: 8 }}>
                                {/* Products */}
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4 }}>Products</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                  {job.products.map((p, i) => (
                                    <div key={i} style={{ background: 'var(--bg-alt)', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
                                      <div style={{ fontWeight: 600 }}>{p.name} {p.mappNo && <span style={{ fontWeight: 400, color: '#888' }}>MAPP {p.mappNo}</span>}</div>
                                      <div style={{ color: '#555' }}>{p.ratePerHa} {p.unit}/ha{p.totalRequired ? ` · Total: ${p.totalRequired} ${p.unit}` : ''}</div>
                                      {p.activeIngredients && <div style={{ color: '#888' }}>{p.activeIngredients}</div>}
                                      {p.expiryDate && <div style={{ color: '#aaa' }}>Exp: {fmtDate(p.expiryDate)}</div>}
                                    </div>
                                  ))}
                                </div>

                                {/* Fields */}
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4 }}>Fields</div>
                                {job.fields.map(f => {
                                  const matched = findMatchingJdOps(f.name, job, jdOps);
                                  return (
                                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                                      <div style={{ flex: 1 }}>
                                        <span style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</span>
                                        <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{f.areaHa} ha · {f.crop}{f.variety ? ` ${f.variety}` : ''}{f.growthStage ? ` · ${f.growthStage}` : ''}</span>
                                        {matched.length > 0 && (
                                          <span className="badge bg-green" style={{ marginLeft: 8, fontSize: 11 }}>
                                            ✓ JD: {matched.map(m => fmtDate(m.startDate)).join(', ')}
                                          </span>
                                        )}
                                        {f.appliedDate && (
                                          <span style={{ fontSize: 11, color: 'var(--green)', marginLeft: 8 }}>Applied {fmtDate(f.appliedDate)}</span>
                                        )}
                                      </div>
                                      {statusBadge(f.status || 'pending')}
                                      <button
                                        className={f.status === 'applied' ? 'btn-cancel' : 'btn-primary'}
                                        style={{ fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap' }}
                                        onClick={() => markFieldApplied(visit.id, job.id, f.name, f.status !== 'applied')}
                                      >{f.status === 'applied' ? 'Undo' : '✓ Applied'}</button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ACTIONS TAB                                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === 'actions' && !filterField && (
        <div className="card">
          <div className="card-title">Outstanding actions</div>
          {pendingJobs.length === 0
            ? <div className="empty">All jobs applied — nothing outstanding.</div>
            : pendingJobs.map(({ visit, job, status }) => (
              <div key={`${visit.id}-${job.id}`} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    Job {job.jobNumber} — {job.reason}
                    {statusBadge(status)}
                  </div>
                  <div className="row-sub">
                    Report {visit.reportNo} · {fmtDate(visit.issueDate)} · {job.totalAreaHa} ha
                    {job.latestDate && ` · deadline ${fmtDate(job.latestDate)}`}
                  </div>
                  {job.comment && <div style={{ fontSize: 12, color: '#e67e00', marginTop: 3 }}>⚠ {job.comment}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                    {job.fields.filter(f => f.status !== 'applied').map(f => (
                      <span key={f.name} className="badge bg-blue">{f.name} {f.areaHa}ha</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                    {job.products.map((p, i) => (
                      <span key={i} className="badge" style={{ background: 'var(--bg-alt)', color: 'var(--text)' }}>{p.name} {p.ratePerHa}{p.unit}/ha</span>
                    ))}
                  </div>
                </div>
                <button
                  className="btn-primary"
                  style={{ fontSize: 12, padding: '4px 12px', whiteSpace: 'nowrap', alignSelf: 'flex-start', marginTop: 4 }}
                  onClick={() => { setExpandedVisit(visit.id); setExpandedJob(job.id); setView('visits'); }}
                >View →</button>
              </div>
            ))
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* JD OPS MATCH TAB                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === 'jdmatch' && !filterField && (
        <div className="card">
          <div className="card-title">JD Operations — recommended vs applied</div>
          {jdOps.filter(o => o.type === 'application').length === 0 && (
            <div className="empty" style={{ marginBottom: 12 }}>No JD application operations synced yet. Sync from the JD Ops tab first.</div>
          )}
          {jdMatches.length === 0
            ? <div className="empty">No JD application operations found matching recommended fields and date windows.</div>
            : jdMatches.map(({ visit, job, field, matched }) => (
              <div key={`${visit.id}-${job.id}-${field.name}`} className="row-item">
                <div style={{ flex: 1 }}>
                  <div className="row-name" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {field.name}
                    <span style={{ fontWeight: 400, color: '#666', fontSize: 13 }}>· {job.reason}</span>
                    {statusBadge(field.status || 'pending')}
                  </div>
                  <div className="row-sub">Recommended: {fmtDate(visit.issueDate)} · Report {visit.reportNo}</div>
                  {/* Recommended products */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                    <span style={{ fontSize: 11, color: '#888', alignSelf: 'center' }}>Recommended:</span>
                    {job.products.map((p, i) => (
                      <span key={i} className="badge bg-blue">{p.name} {p.ratePerHa}{p.unit}/ha</span>
                    ))}
                  </div>
                  {/* Matched JD ops */}
                  {matched.map(op => (
                    <div key={op.id} style={{ marginTop: 5, fontSize: 12, background: '#f0f7ee', borderRadius: 5, padding: '5px 8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--green)' }}>✓ JD Op</span>
                      <span style={{ marginLeft: 6 }}>{fmtDate(op.startDate)} · {op.fieldName}</span>
                      {op.products && op.products.length > 0 && (
                        <span style={{ marginLeft: 6, color: '#555' }}>
                          {op.products.map(p => p.name).join(', ')}
                        </span>
                      )}
                      {op.measurements?.area && (
                        <span style={{ marginLeft: 6, color: '#888' }}>{op.measurements.area} ha covered</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* IMPORT MODAL                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showImportModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setShowImportModal(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-title">Import Gatekeeper report</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Upload the PDF from Luke's Gatekeeper email. Report number and date are read automatically from the file — you only need to fill them in if they're wrong.
            </p>

            <div className="field-row">
              <label className="form-label">Gatekeeper PDF *</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                style={{ fontSize: 13 }}
              />
              {importFile && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Selected: {importFile.name}</div>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field-row" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Report number (optional)</label>
                <input type="text" placeholder="auto-detected" value={importReportNo} onChange={e => setImportReportNo(e.target.value)} />
              </div>
              <div className="field-row" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Issue date (optional)</label>
                <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)} />
              </div>
            </div>

            {importError && (
              <div style={{ fontSize: 12, color: 'var(--red)', background: '#fcecea', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                {importError}
              </div>
            )}
            <div className="modal-btns">
              <button className="btn-primary" onClick={handleImport} disabled={importLoading}>
                {importLoading ? 'Parsing PDF…' : 'Import'}
              </button>
              <button className="btn-cancel" onClick={() => { setShowImportModal(false); setImportError(''); setImportFile(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
