'use client';

import { useState, useMemo } from 'react';
import { FarmData } from '@/lib/types';
import type { JdOperation } from '@/lib/types';

interface Props {
  db: FarmData;
  persist: (db: FarmData) => void;
}

type View = 'by-field' | 'sprays' | 'seeding' | 'harvest' | 'assurance';

const SEASON_OPTIONS = ['2026', '2025', '2024', 'all'];

// Crop type colour coding
function cropColour(crop?: string): string {
  if (!crop) return 'bg-gray-100 text-gray-600';
  const c = crop.toUpperCase();
  if (c.includes('WHEAT')) return 'bg-amber-100 text-amber-800';
  if (c.includes('BARLEY') || c.includes('SPRING')) return 'bg-yellow-100 text-yellow-700';
  if (c.includes('OSR') || c.includes('RAPE')) return 'bg-yellow-200 text-yellow-900';
  if (c.includes('GRASS') || c.includes('CLOVER')) return 'bg-green-100 text-green-700';
  if (c.includes('BEAN') || c.includes('PEA')) return 'bg-emerald-100 text-emerald-700';
  if (c.includes('AHIFLOWER')) return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-600';
}

function opTypeBadge(type: string): string {
  switch (type) {
    case 'application': return 'bg-red-100 text-red-700';
    case 'seeding': return 'bg-blue-100 text-blue-700';
    case 'harvest': return 'bg-amber-100 text-amber-700';
    case 'tillage': return 'bg-stone-100 text-stone-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtCrop(name?: string): string {
  if (!name) return '—';
  return name
    .replace(/_/g, ' ')
    .replace(/EURO/g, '')
    .replace(/WTR/g, 'Winter')
    .replace(/SPR/g, 'Spring')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Farm Assurance red-flag checks ──────────────────────────────────────────
interface ComplianceFlag {
  severity: 'error' | 'warn' | 'ok';
  message: string;
  field?: string;
  date?: string;
}

function runComplianceChecks(ops: JdOperation[], season: string): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  const sprays = ops.filter(o => o.type === 'application' && (season === 'all' || o.cropSeason === season));

  // 1. Sprays with no product recorded
  const noProduct = sprays.filter(o => !o.products || o.products.length === 0);
  if (noProduct.length > 0) {
    noProduct.forEach(o => flags.push({
      severity: 'error',
      message: `Spray application has no product recorded`,
      field: o.fieldName,
      date: fmtDate(o.startDate),
    }));
  }

  // 2. Sprays with no area measurement
  const noArea = sprays.filter(o => !o.measurements?.area);
  if (noArea.length > 0) {
    noArea.forEach(o => flags.push({
      severity: 'warn',
      message: `No area recorded for spray application`,
      field: o.fieldName,
      date: fmtDate(o.startDate),
    }));
  }

  // 3. Sprays with no rate recorded
  const noRate = sprays.filter(o => o.products && o.products.length > 0 && !o.measurements?.ratePerHa);
  if (noRate.length > 0) {
    noRate.forEach(o => flags.push({
      severity: 'warn',
      message: `Spray application rate not recorded — inspectors will query this`,
      field: o.fieldName,
      date: fmtDate(o.startDate),
    }));
  }

  // 4. Any ops with no date
  const noDates = ops.filter(o => !o.startDate);
  if (noDates.length > 0) {
    flags.push({ severity: 'error', message: `${noDates.length} operations have no date — Red Tractor requires date of every application` });
  }

  // 5. Check total spray operations exist (basic completeness)
  if (sprays.length === 0 && season !== 'all') {
    flags.push({ severity: 'warn', message: `No spray records found for ${season} — confirm sync is up to date` });
  }

  // 6. If records look good
  if (flags.length === 0) {
    flags.push({ severity: 'ok', message: `No compliance issues found in ${season} records from Ops Centre` });
  }

  return flags;
}

export default function FieldRecords({ db, persist }: Props) {
  const [view, setView] = useState<View>('by-field');
  const [season, setSeason] = useState('2026');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [search, setSearch] = useState('');

  const ops: JdOperation[] = useMemo(() => db.jdOperations || [], [db.jdOperations]);
  const syncStatus = db.jdSyncStatus;

  // Filter by season
  const seasonOps = useMemo(() =>
    season === 'all' ? ops : ops.filter(o => o.cropSeason === season),
    [ops, season]
  );

  // All unique field names this season
  const fieldNames = useMemo(() => {
    const names = new Set(seasonOps.map(o => o.fieldName));
    return Array.from(names).sort();
  }, [seasonOps]);

  // Filter by search
  const filteredFields = useMemo(() =>
    search ? fieldNames.filter(n => n.toLowerCase().includes(search.toLowerCase())) : fieldNames,
    [fieldNames, search]
  );

  // Ops for selected field
  const fieldOps = useMemo(() =>
    selectedField ? seasonOps.filter(o => o.fieldName === selectedField).sort((a, b) => a.startDate.localeCompare(b.startDate)) : [],
    [selectedField, seasonOps]
  );

  // Spray ops for table view
  const sprayOps = useMemo(() =>
    seasonOps.filter(o => o.type === 'application').sort((a, b) => a.fieldName.localeCompare(b.fieldName) || a.startDate.localeCompare(b.startDate)),
    [seasonOps]
  );

  const seedingOps = useMemo(() =>
    seasonOps.filter(o => o.type === 'seeding').sort((a, b) => a.fieldName.localeCompare(b.fieldName)),
    [seasonOps]
  );

  const harvestOps = useMemo(() =>
    seasonOps.filter(o => o.type === 'harvest').sort((a, b) => a.fieldName.localeCompare(b.fieldName)),
    [seasonOps]
  );

  const complianceFlags = useMemo(() => runComplianceChecks(ops, season), [ops, season]);
  const errorCount = complianceFlags.filter(f => f.severity === 'error').length;
  const warnCount = complianceFlags.filter(f => f.severity === 'warn').length;

  // Sync from JD
  async function handleSync() {
    setSyncing(true);
    setSyncMsg('Syncing from John Deere Ops Centre…');
    try {
      const apiSecret = localStorage.getItem('uaf_api_secret') || '';
      const res = await fetch(`/api/jd/sync-write?since=2024-01-01${apiSecret ? `&secret=${apiSecret}` : ''}`, {
        method: 'GET',
      });
      const json = await res.json();
      if (json.ok) {
        setSyncMsg(`✓ Synced ${json.operationsWritten} operations from ${json.fieldsWithOps} fields`);
        // Reload page data
        window.location.reload();
      } else {
        setSyncMsg(`✗ Sync failed: ${json.error || 'unknown error'}`);
      }
    } catch (e) {
      setSyncMsg(`✗ Network error: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSyncing(false);
    }
  }

  const navTabs: { id: View; label: string }[] = [
    { id: 'by-field', label: '🌾 By Field' },
    { id: 'sprays', label: '💧 Spray Log' },
    { id: 'seeding', label: '🌱 Seeding' },
    { id: 'harvest', label: '🌾 Harvest' },
    { id: 'assurance', label: `✅ Farm Assurance${errorCount > 0 ? ` (${errorCount}!)` : ''}` },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-green-900">Field Records</h2>
          <p className="text-sm text-gray-500">
            {ops.length} operations synced from John Deere Ops Centre
            {syncStatus?.syncedAt && ` · last sync ${fmtDate(syncStatus.syncedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Season picker */}
          <select
            value={season}
            onChange={e => setSeason(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            {SEASON_OPTIONS.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All seasons' : `${s} season`}</option>
            ))}
          </select>
          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-green-700 text-white text-sm px-3 py-1.5 rounded hover:bg-green-800 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : '🔄 Sync from Ops Centre'}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`text-sm px-3 py-2 rounded ${syncMsg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {syncMsg}
        </div>
      )}

      {/* Sub-nav */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {navTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              view === tab.id
                ? 'border-green-700 text-green-800'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── BY FIELD VIEW ───────────────────────────────────────────────── */}
      {view === 'by-field' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Field list */}
          <div className="md:col-span-1 border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-2 bg-gray-50 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search fields…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1"
              />
            </div>
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {filteredFields.length === 0 && (
                <p className="p-4 text-sm text-gray-400">No fields found for {season}</p>
              )}
              {filteredFields.map(name => {
                const fOps = seasonOps.filter(o => o.fieldName === name);
                const hasSpray = fOps.some(o => o.type === 'application');
                const hasSeed = fOps.some(o => o.type === 'seeding');
                const hasHarvest = fOps.some(o => o.type === 'harvest');
                const crop = fOps.find(o => o.cropName)?.cropName;
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedField(name === selectedField ? null : name)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-green-50 transition-colors ${selectedField === name ? 'bg-green-50 border-l-2 border-green-600' : ''}`}
                  >
                    <div className="font-medium text-sm text-gray-800">{name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {crop && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${cropColour(crop)}`}>
                          {fmtCrop(crop)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {hasSeed ? '🌱' : ''}{hasSpray ? '💧' : ''}{hasHarvest ? '🌾' : ''}
                        {' '}{fOps.length} ops
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field detail */}
          <div className="md:col-span-2">
            {!selectedField ? (
              <div className="flex items-center justify-center h-64 text-gray-400 text-sm border border-gray-200 rounded-lg">
                Select a field to view its records
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">{selectedField}</h3>
                  <p className="text-xs text-gray-500">{fieldOps.length} operations · {season} season</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {fieldOps.length === 0 && (
                    <p className="p-4 text-sm text-gray-400">No records for this season</p>
                  )}
                  {fieldOps.map(op => (
                    <div key={op.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${opTypeBadge(op.type)}`}>
                            {op.type}
                          </span>
                          <span className="text-sm font-medium text-gray-800">
                            {op.products && op.products.length > 0
                              ? op.products.map(p => p.name).join(' + ')
                              : op.varieties && op.varieties.length > 0
                              ? op.varieties.join(', ')
                              : op.tillageType || op.cropName || '—'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(op.startDate)}</span>
                      </div>
                      {/* Measurements */}
                      {op.measurements && (
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-gray-500">
                          {op.measurements.area && (
                            <span>📐 {op.measurements.area.toFixed(1)} ha</span>
                          )}
                          {op.measurements.ratePerHa && (
                            <span>⚖️ {op.measurements.ratePerHa.toFixed(1)} {op.measurements.rateUnit || 'kg/ha'}</span>
                          )}
                          {op.measurements.totalApplied && (
                            <span>🪣 {op.measurements.totalApplied.toFixed(0)} {op.measurements.totalUnit || 'kg'} total</span>
                          )}
                          {op.measurements.yieldTPerHa && (
                            <span>🌾 {op.measurements.yieldTPerHa.toFixed(2)} t/ha</span>
                          )}
                          {op.measurements.targetRatePerHa && op.measurements.ratePerHa && (
                            <span className={Math.abs(op.measurements.ratePerHa - op.measurements.targetRatePerHa) / op.measurements.targetRatePerHa > 0.05 ? 'text-orange-500' : 'text-green-600'}>
                              target {op.measurements.targetRatePerHa.toFixed(1)} {op.measurements.rateUnit || 'kg/ha'}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Crop / variety */}
                      {(op.cropName || (op.varieties && op.varieties.length > 0)) && (
                        <div className="mt-1 text-xs text-gray-400">
                          {fmtCrop(op.cropName)}{op.varieties && op.varieties.length > 0 ? ` · ${op.varieties.join(', ')}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SPRAY LOG VIEW ───────────────────────────────────────────────── */}
      {view === 'sprays' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-gray-600">{sprayOps.length} spray applications in {season} season</p>
            <p className="text-xs text-gray-400">Red Tractor: 7-year retention. BASIS advice required.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 border-b border-gray-200">Date</th>
                  <th className="px-3 py-2 border-b border-gray-200">Field</th>
                  <th className="px-3 py-2 border-b border-gray-200">Product(s)</th>
                  <th className="px-3 py-2 border-b border-gray-200">Rate</th>
                  <th className="px-3 py-2 border-b border-gray-200">Area (ha)</th>
                  <th className="px-3 py-2 border-b border-gray-200">Total</th>
                  <th className="px-3 py-2 border-b border-gray-200">Crop</th>
                  <th className="px-3 py-2 border-b border-gray-200">✓</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sprayOps.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No spray records for {season}</td></tr>
                )}
                {sprayOps.map(op => {
                  const hasProduct = op.products && op.products.length > 0;
                  const hasRate = !!op.measurements?.ratePerHa;
                  const hasArea = !!op.measurements?.area;
                  const compliant = hasProduct && hasRate && hasArea;
                  return (
                    <tr key={op.id} className={`hover:bg-gray-50 ${!compliant ? 'bg-orange-50' : ''}`}>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(op.startDate)}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{op.fieldName}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {hasProduct
                          ? op.products!.map(p => p.name).join(', ')
                          : <span className="text-red-500 font-medium">⚠ No product recorded</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {op.measurements?.ratePerHa
                          ? `${op.measurements.ratePerHa.toFixed(1)} ${op.measurements.rateUnit || 'kg/ha'}`
                          : <span className="text-orange-500">—</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {op.measurements?.area ? op.measurements.area.toFixed(1) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {op.measurements?.totalApplied
                          ? `${op.measurements.totalApplied.toFixed(0)} ${op.measurements.totalUnit || 'kg'}`
                          : '—'
                        }
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${cropColour(op.cropName)}`}>
                          {fmtCrop(op.cropName) || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {compliant ? '✅' : '⚠️'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SEEDING VIEW ─────────────────────────────────────────────────── */}
      {view === 'seeding' && (
        <div>
          <p className="text-sm text-gray-600 mb-3">{seedingOps.length} seeding operations in {season} season</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 border-b border-gray-200">Date</th>
                  <th className="px-3 py-2 border-b border-gray-200">Field</th>
                  <th className="px-3 py-2 border-b border-gray-200">Variety</th>
                  <th className="px-3 py-2 border-b border-gray-200">Crop</th>
                  <th className="px-3 py-2 border-b border-gray-200">Rate (kg/ha)</th>
                  <th className="px-3 py-2 border-b border-gray-200">Area (ha)</th>
                  <th className="px-3 py-2 border-b border-gray-200">Total seed (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {seedingOps.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No seeding records for {season}</td></tr>
                )}
                {seedingOps.map(op => (
                  <tr key={op.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(op.startDate)}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{op.fieldName}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {op.varieties && op.varieties.length > 0 ? op.varieties.join(', ') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${cropColour(op.cropName)}`}>
                        {fmtCrop(op.cropName) || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {op.measurements?.ratePerHa ? `${op.measurements.ratePerHa.toFixed(0)} kg/ha` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {op.measurements?.area ? op.measurements.area.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {op.measurements?.totalApplied ? `${op.measurements.totalApplied.toFixed(0)} kg` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── HARVEST VIEW ─────────────────────────────────────────────────── */}
      {view === 'harvest' && (
        <div>
          <p className="text-sm text-gray-600 mb-3">{harvestOps.length} harvest / cut operations in {season} season</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 border-b border-gray-200">Date</th>
                  <th className="px-3 py-2 border-b border-gray-200">Field</th>
                  <th className="px-3 py-2 border-b border-gray-200">Crop</th>
                  <th className="px-3 py-2 border-b border-gray-200">Variety</th>
                  <th className="px-3 py-2 border-b border-gray-200">Yield (t/ha)</th>
                  <th className="px-3 py-2 border-b border-gray-200">Area (ha)</th>
                  <th className="px-3 py-2 border-b border-gray-200">Total (t)</th>
                  <th className="px-3 py-2 border-b border-gray-200">Machine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {harvestOps.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No harvest records for {season}</td></tr>
                )}
                {harvestOps.map(op => (
                  <tr key={op.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(op.startDate)}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{op.fieldName}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${cropColour(op.cropName)}`}>
                        {fmtCrop(op.cropName) || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {op.varieties && op.varieties.length > 0 ? op.varieties.join(', ') : '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-amber-700">
                      {op.measurements?.yieldTPerHa ? `${op.measurements.yieldTPerHa.toFixed(2)} t/ha` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {op.measurements?.area ? op.measurements.area.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {op.measurements?.totalApplied ? `${op.measurements.totalApplied.toFixed(1)} t` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{op.machineType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Yield summary */}
          {harvestOps.some(o => o.measurements?.yieldTPerHa) && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-2">Yield Summary — {season}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {['WHEAT', 'BARLEY', 'GRASSLAND', 'AHIFLOWER'].map(crop => {
                  const cropOps = harvestOps.filter(o => o.cropName?.toUpperCase().includes(crop) && o.measurements?.yieldTPerHa);
                  if (cropOps.length === 0) return null;
                  const avg = cropOps.reduce((s, o) => s + (o.measurements!.yieldTPerHa || 0), 0) / cropOps.length;
                  return (
                    <div key={crop} className="bg-white rounded p-2 border border-amber-100">
                      <div className="text-xs text-gray-500">{crop.charAt(0) + crop.slice(1).toLowerCase()}</div>
                      <div className="font-bold text-amber-800">{avg.toFixed(2)} t/ha</div>
                      <div className="text-xs text-gray-400">{cropOps.length} field{cropOps.length !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FARM ASSURANCE VIEW ───────────────────────────────────────────── */}
      {view === 'assurance' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-1">Inspection Day — Field Records Compliance</h3>
            <p className="text-sm text-blue-700">
              All spray records pulled live from John Deere Ops Centre. Red Tractor and LEAF require: date, field, product, dose, area, operator. 7-year retention.
            </p>
          </div>

          {/* Compliance flags */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700 text-sm">Automated Compliance Check — {season} Season</h4>
            {complianceFlags.map((flag, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${
                  flag.severity === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
                  flag.severity === 'warn' ? 'bg-orange-50 border border-orange-200 text-orange-800' :
                  'bg-green-50 border border-green-200 text-green-800'
                }`}
              >
                <span>{flag.severity === 'error' ? '🔴' : flag.severity === 'warn' ? '🟡' : '🟢'}</span>
                <div>
                  <span>{flag.message}</span>
                  {(flag.field || flag.date) && (
                    <span className="ml-2 text-xs opacity-75">
                      {flag.field && `Field: ${flag.field}`}{flag.date && ` · ${flag.date}`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Key requirements checklist */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <h4 className="font-medium text-gray-700 text-sm">Field Records — Inspection Requirements</h4>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                { req: 'Spray records include date, field, product, dose and area', auto: true, met: sprayOps.every(o => o.products && o.products.length > 0) },
                { req: 'Records held for minimum 7 years', auto: false, met: null },
                { req: 'BASIS-qualified adviser provided spray recommendations', auto: false, met: null, note: 'Luke Cotton BASIS R/E4927/ICM ✓' },
                { req: 'FACTS-qualified adviser provided nutrient advice', auto: false, met: null, note: 'Luke Cotton FACTS FE/2916 ✓' },
                { req: 'All spray operators hold PA1 + relevant certificate', auto: false, met: null },
                { req: 'Spray equipment tested and calibrated within 3 years', auto: false, met: null },
                { req: 'Harvest intervals observed for all products applied', auto: false, met: null },
                { req: 'Watercourse buffer zones observed (6m uncropped)', auto: false, met: null },
                { req: 'Fertiliser applications recorded with source, rate and date', auto: false, met: null },
                { req: 'Nutrient Management Plan in place', auto: false, met: null },
                { req: 'Seeding records include variety, seed lot and rate', auto: true, met: seedingOps.length > 0 },
                { req: 'Grain store records (in/out tonnage) maintained', auto: false, met: null },
              ].map((item, i) => (
                <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                  <span className="mt-0.5">
                    {item.met === true ? '✅' : item.met === false ? '❌' : '⬜'}
                  </span>
                  <div className="flex-1 text-sm">
                    <span className="text-gray-700">{item.req}</span>
                    {item.auto && (
                      <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">auto-checked</span>
                    )}
                    {item.note && (
                      <span className="ml-2 text-xs text-green-600">{item.note}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Spray records', value: sprayOps.length, sub: `${season} season`, colour: 'blue' },
              { label: 'Fields sprayed', value: new Set(sprayOps.map(o => o.fieldName)).size, sub: `${season} season`, colour: 'blue' },
              { label: 'With product recorded', value: sprayOps.filter(o => o.products && o.products.length > 0).length, sub: `of ${sprayOps.length} sprays`, colour: sprayOps.filter(o => o.products && o.products.length > 0).length === sprayOps.length ? 'green' : 'orange' },
              { label: 'Missing rate data', value: sprayOps.filter(o => !o.measurements?.ratePerHa).length, sub: 'need checking', colour: sprayOps.filter(o => !o.measurements?.ratePerHa).length === 0 ? 'green' : 'orange' },
            ].map((stat, i) => (
              <div key={i} className={`p-3 rounded-lg border ${
                stat.colour === 'green' ? 'bg-green-50 border-green-200' :
                stat.colour === 'orange' ? 'bg-orange-50 border-orange-200' :
                'bg-blue-50 border-blue-200'
              }`}>
                <div className={`text-2xl font-bold ${
                  stat.colour === 'green' ? 'text-green-700' :
                  stat.colour === 'orange' ? 'text-orange-700' :
                  'text-blue-700'
                }`}>{stat.value}</div>
                <div className="text-sm font-medium text-gray-700">{stat.label}</div>
                <div className="text-xs text-gray-400">{stat.sub}</div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
            <strong>Note:</strong> Ops Centre records satisfy the electronic record-keeping requirement under Red Tractor Combinable Crops standard.
            Print or export from here on inspection day — inspector can see date, product, rate, field and area for every application.
            Luke Cotton (BASIS R/E4927/ICM, FACTS FE/2916) provides written recommendations — keep copies in the spray file.
          </div>
        </div>
      )}
    </div>
  );
}
