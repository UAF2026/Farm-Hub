'use client';

import { useState } from 'react';

interface Farm {
  name: string;
  tenure: string;
  security: string;
  location: string;
  details: string[];
  action: string;
  secColor: string;
}

const FARMS: Farm[] = [
  {
    name: 'Upper Assendon Farm',
    tenure: 'AHT 3 generation',
    security: 'Secure James\'s lifetime',
    location: 'Stonor Henley-on-Thames Oxfordshire RG9 6HE',
    details: [
      'Family farmed 4 generations',
      'Mixed beef and arable',
      '1,200t grain store',
      'Beef buildings at Coxslease Farm',
      'SFI 1 UAF332270030 £56,074/yr ends Mar 2027',
      'SFI 2 M J Hunt & Son 24 £38,418/yr ends Nov 2027',
      'SFI 3 M J Hunt & Son 25E £9,300/yr ends Sep 2028',
      'CS Agreement 1255553 ends Dec 2026'
    ],
    action: 'Plan CS and SFI replacement before Dec 2026. Explore succession for Charlie.',
    secColor: 'bg-green'
  },
  {
    name: 'Bix Hall Estate',
    tenure: 'Annual cropping licence + 6 month grazing',
    security: 'Very low - terminable 1 month notice',
    location: 'Bix Hall Bix Henley-on-Thames RG9 6BW',
    details: [
      'Licensor: Bix Hall Farm Partnership - Lord Alvingham',
      'Agents: Savills',
      'Farmed ~30 years',
      'Current licence: 57.85ha (142.95ac) winter wheat only',
      'Licence period: 1 Oct 2025 to 30 Sep 2026',
      'Licence fee: £4.50/acre (£643.28 + VAT)',
      'Licensor CS Mid Tier 1458943 ending 2027',
      'Licensor SFI 1895125 ending 2027',
      '9 named fields: Soundess, Barn, Lunch, Black Dean & Pages, Top East, Bottom Top East, Home, Freedom, Church',
      'SFI obligations: no insecticides, no-till, variable rate inputs',
      'Landowners want: income, conservation, legacy, low hassle'
    ],
    action: 'STRATEGIC PRIORITY: CS and SFI end 2027 - FBT proposal window opening. Prepare proposal by autumn 2026. Frame around conservation, income, legacy and low hassle. Consider naming Charlie as co-tenant.',
    secColor: 'bg-amber'
  },
  {
    name: 'Hollandridge Farm',
    tenure: 'Gentleman agreement',
    security: 'Very low no formal agreement',
    location: 'Near Piddington Oxfordshire',
    details: [
      'Farmed 60+ years',
      'No formal written agreement',
      'Long-standing relationship but legally vulnerable'
    ],
    action: 'Consider formalising with written agreement.',
    secColor: 'bg-amber'
  },
  {
    name: 'Grange & Shenley Farm',
    tenure: 'Contractors agreement',
    security: 'Low contractor basis',
    location: 'Oxfordshire',
    details: [
      'Farmed on contractors basis',
      'No security of tenure',
      'Additional arable acreage'
    ],
    action: 'Monitor relationship and performance.',
    secColor: 'bg-gray'
  },
  {
    name: 'Owned Land',
    tenure: 'Freehold owned',
    security: 'Permanent - only fully secure land',
    location: 'Upper Assendon area Oxfordshire',
    details: [
      '164 acres owned outright',
      'Only fully secure land asset',
      'Mix of arable and permanent grass'
    ],
    action: 'Protect this asset. Consider succession planning for Charlie.',
    secColor: 'bg-green'
  },
  {
    name: 'Weston House',
    tenure: 'Owned residential let',
    security: 'Permanent owned',
    location: 'Opposite Upper Assendon Farm Stonor',
    details: [
      'Residential property owned by M J Hunt & Son',
      'Currently tenanted',
      'Important off-farm income stream',
      'Requires: gas safety, electrical certificate, EPC compliance'
    ],
    action: 'Ensure all compliance certificates up to date. Track tenancy renewal dates.',
    secColor: 'bg-green'
  }
];

export default function Farms() {
  const [selected, setSelected] = useState<string | null>(null);
  const farm = FARMS.find(f => f.name === selected);

  if (selected && farm) {
    return (
      <>
        <button onClick={() => setSelected(null)} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: 'var(--bg-secondary)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
          ← Back to farms
        </button>
        <div className="card">
          <div className="card-title">{farm.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div className="row-sub">Tenure</div>
              <div className="row-name">{farm.tenure}</div>
            </div>
            <div>
              <div className="row-sub">Security</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className={`badge ${farm.secColor}`} style={{ fontSize: 12 }}>{farm.security}</div>
              </div>
            </div>
            <div>
              <div className="row-sub">Location</div>
              <div className="row-name">{farm.location}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Details</div>
          {farm.details.map((d, i) => (
            <div key={i} className="row-item">
              <div style={{ fontSize: 13, flex: 1 }}>{d}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{ borderLeft: '4px solid var(--amber)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0', background: 'rgba(230, 126, 34, 0.05)' }}>
          <div className="card-title" style={{ color: 'var(--amber)' }}>Action</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>{farm.action}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {FARMS.map(f => (
          <div
            key={f.name}
            onClick={() => setSelected(f.name)}
            className="card"
            style={{ cursor: 'pointer', transition: 'transform 0.2s', border: `1px solid var(--border)` }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <div className="card-title">{f.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: 12 }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Tenure:</span> {f.tenure}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Security:</span>
                <span className={`badge ${f.secColor}`}>{f.security}</span>
              </div>
              <div style={{ color: 'var(--text-muted)' }}>{f.location}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Portfolio summary</div>
        <div className="row-item">
          <div className="row-name">Total farmed</div>
          <div className="row-sub">~1,750 acres</div>
        </div>
        <div className="row-item">
          <div className="row-name">Owned land</div>
          <div className="row-sub">164 acres + Weston House</div>
        </div>
        <div className="row-item">
          <div className="row-name">Secure tenure</div>
          <div className="row-sub">AHT (Upper Assendon) + owned land</div>
        </div>
        <div className="row-item">
          <div className="row-name">At risk</div>
          <div className="row-sub">Bix Hall, Hollandridge, Grange & Shenley</div>
        </div>
      </div>
    </>
  );
}
