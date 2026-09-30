'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { FarmData } from '@/lib/types';
import { fmtDate } from '@/lib/utils';

interface Props { db: FarmData; }

/* Every assurance document held on file. Add a new one here — filename must match
   the file in public/assurance-docs/ exactly. Keywords widen what the search box catches
   (e.g. she says "colostrum", not the filename). */
const DOCUMENTS: { name: string; file: string; keywords?: string }[] = [
  { name: 'TB Test Certificate (Sept 2026)', file: 'tb-test-certificate-sept-2026.pdf', keywords: 'tb tuberculosis apha ovt clear otf' },
  { name: 'Farm Visitor Log Book', file: 'farm-visitor-log-book.pdf', keywords: 'biosecurity entrance' },
  { name: 'Fallen Stock — NFSCo Invoice', file: 'fallen-stock-nfsco-invoice.pdf', keywords: 'knacker collection carcass' },
  { name: 'Health and Safety Policy', file: 'health-and-safety-policy.pdf', keywords: 'h&s' },
  { name: 'Biosecurity Policy', file: 'biosecurity-policy.pdf' },
  { name: 'Emergency Contingency Plan', file: 'emergency-contingency-plan.pdf', keywords: 'fire flood power cut disease outbreak contacts' },
  { name: 'Broken Needle Policy', file: 'broken-needle-policy.pdf' },
  { name: 'Complaints and Sample Recording Procedure', file: 'complaints-and-sample-recording-procedure.pdf' },
  { name: 'Manure Management Plan', file: 'manure-management-plan.pdf', keywords: 'fym slurry storage nvz' },
  { name: 'Vermin Control Annual Site Survey', file: 'vermin-control-annual-site-survey.pdf', keywords: 'rodent bait pest control' },
  { name: 'Grain Storage Strategy and Records Pack', file: 'grain-storage-strategy-and-records-pack.pdf', keywords: 'moisture temperature fan cleaning probe calibration mass balance cornstore' },
  { name: 'Antibiotic Usage Declaration', file: 'antibiotic-usage-declaration.pdf', keywords: 'ahdb medicine hub amu' },
  { name: 'Crop and Store Risk Assessments', file: 'crop-and-store-risk-assessments.pdf', keywords: 'growing crop grain store soil compaction' },
  { name: 'IPM Plan (Voluntary Initiative assessment — official)', file: 'ipm-plan-voluntary-initiative.pdf', keywords: 'integrated pest management sfi1 ipm1 bydv wydv voluntary initiative savills luke cotton score' },
  { name: 'IPM Plan (internal draft — superseded)', file: 'ipm-plan-draft.pdf', keywords: 'integrated pest management draft' },
  { name: 'Calf Colostrum and Livestock Transport Policy', file: 'calf-colostrum-and-livestock-transport-policy.pdf', keywords: 'trailer fit to travel lt7' },
  { name: 'Chemical Store Emergency Contact List', file: 'chemical-store-emergency-contact-list.pdf', keywords: 'spray store' },
  { name: 'Spray Store Warning Signs', file: 'spray-store-warning-signs.pdf', keywords: 'no smoking naked flame signage' },
  { name: 'Farm Map — Yard Layout', file: 'farm-map-yard-layout.pdf', keywords: 'buildings entrance cph watercourse borehole' },
  { name: 'Farm Map — Aerial Reference', file: 'farm-map-aerial-reference.html', keywords: 'satellite' },
  { name: 'Chemical Store Inventory and Fertiliser Stock List', file: 'chemical-store-inventory-and-fertiliser-stock-list.pdf' },
  { name: 'Soil Management Plan (SFI SAM1)', file: 'uaf-soil-management-plan-2026.pdf', keywords: 'compaction organic matter erosion vsa ctf subsoiling nutrient' },
  { name: 'Herd Health Plan', file: 'uaf-herd-health-plan-july-2026.pdf', keywords: 'bvd tb ibr lepto johnes vhp adelle jenkins' },
  { name: 'Herd Health Plan — Signed Original (Adelle Jenkins MRCVS)', file: 'herd-health-plan-signed.pdf', keywords: 'bvd tb ibr lepto johnes vhp adelle jenkins vet signed copper toxicity reactors calving' },
  { name: 'Hedgerow Management Plan', file: 'uaf-hedgerow-management-plan-2026.pdf', keywords: 'be3 cutting' },
];

type Row = {
  key: string;
  kind: 'Document' | 'Certificate' | 'Checklist';
  title: string;
  subtitle: string;
  href?: string;
  pillLabel?: string;
  pillTone?: 'green' | 'amber' | 'red' | 'grey';
  searchText: string;
};

function certTone(expiry: string): { label: string; tone: 'green' | 'amber' | 'red' | 'grey' } {
  if (!expiry) return { label: 'no expiry on file', tone: 'grey' };
  const days = Math.round((new Date(expiry + 'T00:00:00').getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: `expired ${fmtDate(expiry)}`, tone: 'red' };
  if (days <= 60) return { label: `expires ${fmtDate(expiry)}`, tone: 'amber' };
  return { label: `valid to ${fmtDate(expiry)}`, tone: 'green' };
}

export default function Assurance({ db }: Props) {
  const [q, setQ] = useState('');

  const rows: Row[] = useMemo(() => {
    const docRows: Row[] = DOCUMENTS.map(d => ({
      key: `doc-${d.file}`,
      kind: 'Document',
      title: d.name,
      subtitle: 'Tap to open / print',
      href: `/assurance-docs/${d.file}`,
      searchText: `${d.name} ${d.keywords ?? ''}`.toLowerCase(),
    }));

    const certRows: Row[] = (db.certificates ?? []).map(c => {
      const t = certTone(c.expiryDate);
      return {
        key: `cert-${c.id}`,
        kind: 'Certificate',
        title: c.name,
        subtitle: [c.certNumber, c.holder].filter(Boolean).join(' · ') || '—',
        pillLabel: t.label,
        pillTone: t.tone,
        href: c.documentUrl,
        searchText: `${c.name} ${c.certNumber} ${c.holder} ${c.category} ${c.notes}`.toLowerCase(),
      };
    });

    const checklistRows: Row[] = (db.checklist ?? []).map(item => ({
      key: `chk-${item.id}`,
      kind: 'Checklist',
      title: item.item,
      subtitle: [item.section, item.notes].filter(Boolean).join(' — '),
      href: item.documentUrl,
      pillLabel: item.status,
      pillTone: item.status === 'Yes' || item.status === 'N/A' ? 'green' : item.status === 'Action required' ? 'amber' : 'red',
      searchText: `${item.item} ${item.section} ${item.notes}`.toLowerCase(),
    }));

    return [...docRows, ...certRows, ...checklistRows];
  }, [db.certificates, db.checklist]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => r.searchText.includes(term));
  }, [q, rows]);

  const expiredCerts = (db.certificates ?? []).filter(c => c.expiryDate && certTone(c.expiryDate).tone === 'red');
  const openActions = (db.checklist ?? []).filter(c => c.status === 'Action required');

  return (
    <div>
      <div className="card-title" style={{ marginBottom: '0.75rem' }}>Farm Assurance — quick find</div>

      <input
        type="text"
        autoFocus
        placeholder="Search anything — e.g. TB, colostrum, spray store, VHP, BASIS…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          width: '100%',
          padding: '0.9rem 1rem',
          marginBottom: '0.9rem',
          border: '2px solid var(--green)',
          borderRadius: 'var(--radius)',
          fontSize: '18px',
        }}
      />

      {!q && (expiredCerts.length > 0 || openActions.length > 0) && (
        <div className="card" style={{ marginBottom: '0.9rem', background: '#fef3c7' }}>
          <div className="card-title" style={{ color: '#92400e' }}>Before she arrives</div>
          {expiredCerts.map(c => (
            <div key={c.id} className="row-item" style={{ color: '#92400e' }}>
              {c.name} — expired {fmtDate(c.expiryDate)}
            </div>
          ))}
          {openActions.map(c => (
            <div key={c.id} className="row-item" style={{ color: '#92400e' }}>
              {c.item}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty">No matches for &ldquo;{q}&rdquo;.</div>
        ) : (
          filtered.map(r => {
            const content = (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                        color: 'var(--green-light)',
                      }}
                    >
                      {r.kind}
                    </span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 500 }}>{r.title}</div>
                  {r.subtitle && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary, #666)' }}>{r.subtitle}</div>
                  )}
                </div>
                {r.pillLabel && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      padding: '4px 10px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                      background:
                        r.pillTone === 'green' ? 'var(--green-pale)' :
                        r.pillTone === 'amber' ? '#fef3c7' :
                        r.pillTone === 'red' ? '#fee2e2' : 'var(--bg-secondary, #f4f4f4)',
                      color:
                        r.pillTone === 'green' ? 'var(--green)' :
                        r.pillTone === 'amber' ? '#92400e' :
                        r.pillTone === 'red' ? 'var(--red)' : 'inherit',
                    }}
                  >
                    {r.pillLabel}
                  </span>
                )}
              </>
            );
            const rowStyle: CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem 1.1rem',
            };
            return r.href ? (
              <a
                key={r.key}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="row-item"
                style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}
              >
                {content}
              </a>
            ) : (
              <div key={r.key} className="row-item" style={rowStyle}>
                {content}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
