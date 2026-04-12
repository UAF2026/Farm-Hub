'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { FarmData, Field } from '@/lib/types';

interface Props {
  db: FarmData;
  persist: (newDb: FarmData) => void;
  addActivity: (msg: string) => void;
}

/* ─── Crop colours ─────────────────────────────────────────────────────────── */
const CROP_COLORS: Record<string, string> = {
  'Winter Wheat':       '#e8c840',
  'Winter Barley':      '#d4900a',
  'Winter OSR':         '#b8d820',
  'Spring Barley':      '#f0a020',
  'Spring Wheat':       '#e8d050',
  'Spring Oats':        '#d8b840',
  'Maize':              '#f8d810',
  'Permanent Grassland':'#3a8c3a',
  'Herbal Ley':         '#68c068',
  'Cover Crop':         '#30a070',
  'Fallow':             '#b8a878',
  'Woodland':           '#205020',
  'Set-aside':          '#a8b888',
};
function cropColor(crop: string) { return CROP_COLORS[crop] || '#78a8c8'; }

/* ─── Load Leaflet from CDN ─────────────────────────────────────────────────── */
let leafletLoaded = false;
function loadLeaflet(): Promise<typeof window.L> {
  return new Promise((resolve) => {
    if (leafletLoaded && (window as any).L) { resolve((window as any).L); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => { leafletLoaded = true; resolve((window as any).L); };
    document.head.appendChild(script);
  });
}

/* ─── Parcel panel state ────────────────────────────────────────────────────── */
interface ParcelInfo {
  parcelId: string;
  sheetId: string;
  areaHa: number;
  field: Field | null;  // existing field linked to this parcel, or null
}

export default function FieldMap({ db, persist, addActivity }: Props) {
  const mapRef = useRef<any>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<any>(null);
  const geoLayerRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const [basemap, setBasemap] = useState<'osm' | 'sat'>('sat');
  const [selected, setSelected] = useState<ParcelInfo | null>(null);
  const [editName, setEditName] = useState('');
  const [editCrop, setEditCrop] = useState('');
  const [editVariety, setEditVariety] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const dbRef = useRef(db);
  dbRef.current = db;

  /* ─── Init map ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current || !mapDivRef.current) return;
    loadLeaflet().then((L) => {
      const map = L.map(mapDivRef.current!, {
        center: [51.588, -0.962],
        zoom: 14,
        zoomControl: true,
      });
      mapRef.current = map;

      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      });
      const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: '© Esri World Imagery', maxZoom: 19 }
      );
      const satLabels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { attribution: '', maxZoom: 19, opacity: 0.7 }
      );
      layerRef.current = { osm, sat, satLabels };
      sat.addTo(map);
      satLabels.addTo(map);

      // Load GeoJSON
      fetch('/land-parcels.geojson')
        .then(r => r.json())
        .then(geojson => {
          addGeoJSON(L, map, geojson);
          setMapReady(true);
        })
        .catch(err => console.error('GeoJSON load failed', err));
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Refresh parcel colours when db.fields changes ──────────────────── */
  useEffect(() => {
    if (!mapReady || !geoLayerRef.current) return;
    refreshStyles();
    refreshLabels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.fields, mapReady]);

  function addGeoJSON(L: any, map: any, geojson: any) {
    // Labels layer group
    const labelsGroup = L.layerGroup().addTo(map);
    labelsLayerRef.current = labelsGroup;

    const geo = L.geoJSON(geojson, {
      style: (feature: any) => styleFeature(feature),
      onEachFeature: (feature: any, layer: any) => {
        layer.on('click', () => {
          const { PARCEL_ID, SHEET_ID, AREA_HA } = feature.properties;
          const existing = dbRef.current.fields.find(f => f.parcel === PARCEL_ID) || null;
          setSelected({ parcelId: PARCEL_ID, sheetId: SHEET_ID, areaHa: parseFloat(AREA_HA), field: existing });
          setEditName(existing?.name || '');
          setEditCrop(existing?.crop || '');
          setEditVariety(existing?.variety || '');
          setEditNotes(existing?.notes || '');
        });
        layer.on('mouseover', () => layer.setStyle({ weight: 3, opacity: 1 }));
        layer.on('mouseout', () => geo.resetStyle(layer));
      },
    }).addTo(map);
    geoLayerRef.current = geo;
    addLabels(L, map, geojson);
    // Fit map to parcels
    map.fitBounds(geo.getBounds(), { padding: [20, 20] });
  }

  function styleFeature(feature: any) {
    const parcelId = feature.properties.PARCEL_ID;
    const field = dbRef.current.fields.find(f => f.parcel === parcelId);
    const color = field ? cropColor(field.crop) : '#78a8c8';
    return {
      fillColor: color,
      fillOpacity: field ? 0.55 : 0.3,
      color: '#ffffff',
      weight: 1.5,
      opacity: 0.8,
    };
  }

  function refreshStyles() {
    if (!geoLayerRef.current) return;
    geoLayerRef.current.eachLayer((layer: any) => {
      geoLayerRef.current.resetStyle(layer);
    });
  }

  function addLabels(L: any, map: any, geojson: any) {
    if (!labelsLayerRef.current) return;
    labelsLayerRef.current.clearLayers();
    geojson.features.forEach((feature: any) => {
      const parcelId = feature.properties.PARCEL_ID;
      const field = dbRef.current.fields.find(f => f.parcel === parcelId);
      if (!field?.name) return;
      // Compute rough centroid
      const coords = feature.geometry.coordinates[0];
      let cx = 0, cy = 0;
      coords.forEach(([lon, lat]: number[]) => { cx += lon; cy += lat; });
      cx /= coords.length; cy /= coords.length;
      const marker = L.marker([cy, cx], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:rgba(0,0,0,0.55);color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none;">${field.name}</div>`,
          iconAnchor: [0, 0],
        }),
        interactive: false,
      });
      labelsLayerRef.current.addLayer(marker);
    });
  }

  function refreshLabels() {
    if (!mapRef.current || !labelsLayerRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    // Re-fetch geojson from cache or just rebuild from existing layer
    fetch('/land-parcels.geojson')
      .then(r => r.json())
      .then(geojson => addLabels(L, mapRef.current, geojson));
  }

  /* ─── Switch basemap ─────────────────────────────────────────────────── */
  function switchBasemap(to: 'osm' | 'sat') {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    if (to === 'osm') {
      map.removeLayer(layers.sat);
      map.removeLayer(layers.satLabels);
      layers.osm.addTo(map);
    } else {
      map.removeLayer(layers.osm);
      layers.sat.addTo(map);
      layers.satLabels.addTo(map);
    }
    // Bring parcels to front
    if (geoLayerRef.current) geoLayerRef.current.bringToFront();
    if (labelsLayerRef.current) labelsLayerRef.current.bringToFront();
    setBasemap(to);
  }

  /* ─── Save field ─────────────────────────────────────────────────────── */
  function saveField() {
    if (!selected) return;
    const newField: Field = {
      name: editName.trim() || `Parcel ${selected.parcelId}`,
      area: selected.areaHa,
      status: 'Active',
      crop: editCrop,
      variety: editVariety,
      notes: editNotes,
      parcel: selected.parcelId,
      sheetId: selected.sheetId,
    };
    const existing = db.fields.find(f => f.parcel === selected.parcelId);
    const updated = existing
      ? db.fields.map(f => f.parcel === selected.parcelId ? newField : f)
      : [...db.fields, newField];
    persist({ ...db, fields: updated });
    addActivity(`Updated field: ${newField.name} (${newField.crop || 'unassigned'})`);
    setSelected(prev => prev ? { ...prev, field: newField } : null);
  }

  function deleteField() {
    if (!selected) return;
    persist({ ...db, fields: db.fields.filter(f => f.parcel !== selected.parcelId) });
    addActivity(`Removed field name for parcel ${selected.parcelId}`);
    setSelected(prev => prev ? { ...prev, field: null } : null);
    setEditName(''); setEditCrop(''); setEditVariety(''); setEditNotes('');
  }

  /* ─── Summary counts ─────────────────────────────────────────────────── */
  const namedCount = db.fields.filter(f => f.parcel).length;
  const cropSummary: Record<string, number> = {};
  db.fields.forEach(f => { if (f.crop) cropSummary[f.crop] = (cropSummary[f.crop] || 0) + f.area; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '0 0 auto', padding: '0.75rem 1.25rem', margin: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RPA Parcels</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>63</div>
        </div>
        <div className="card" style={{ flex: '0 0 auto', padding: '0.75rem 1.25rem', margin: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Named Fields</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{namedCount}</div>
        </div>
        <div className="card" style={{ flex: '0 0 auto', padding: '0.75rem 1.25rem', margin: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Area</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>501 ha</div>
        </div>
        {Object.entries(cropSummary).slice(0, 3).map(([crop, area]) => (
          <div key={crop} className="card" style={{ flex: '0 0 auto', padding: '0.75rem 1.25rem', margin: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{crop}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: cropColor(crop) }}>{area.toFixed(0)} ha</div>
          </div>
        ))}
      </div>

      {/* Map + panel row */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 4 }}>
            <button
              onClick={() => switchBasemap('sat')}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: basemap === 'sat' ? 'var(--primary)' : 'rgba(255,255,255,0.9)',
                color: basemap === 'sat' ? '#fff' : '#333',
                border: '1px solid rgba(0,0,0,0.2)', borderRadius: '4px 0 0 4px',
              }}
            >Satellite</button>
            <button
              onClick={() => switchBasemap('osm')}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: basemap === 'osm' ? 'var(--primary)' : 'rgba(255,255,255,0.9)',
                color: basemap === 'osm' ? '#fff' : '#333',
                border: '1px solid rgba(0,0,0,0.2)', borderRadius: '0 4px 4px 0',
              }}
            >Map</button>
          </div>
          <div
            ref={mapDivRef}
            style={{ width: '100%', height: 560, borderRadius: 8, overflow: 'hidden', background: '#e8e0d8' }}
          />
          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 24, left: 10, zIndex: 1000,
            background: 'rgba(255,255,255,0.92)', borderRadius: 6, padding: '8px 12px',
            fontSize: 11, boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}>
            {Object.entries(CROP_COLORS).slice(0, 8).map(([crop, color]) => (
              <div key={crop} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: color, border: '1px solid rgba(0,0,0,0.15)' }} />
                <span>{crop}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingTop: 4, borderTop: '1px solid #eee' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: '#78a8c8', border: '1px solid rgba(0,0,0,0.15)' }} />
              <span>Unnamed parcel</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
            Click any parcel to name it and assign a crop
          </div>
        </div>

        {/* Side panel */}
        {selected && (
          <div className="card" style={{ width: 280, flexShrink: 0, margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div className="card-title" style={{ margin: 0 }}>
                {selected.field?.name || `Parcel ${selected.parcelId}`}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Sheet {selected.sheetId} / Parcel {selected.parcelId} · {selected.areaHa.toFixed(2)} ha
            </div>

            <div className="field-row">
              <label className="form-label">Field name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} placeholder={`Parcel ${selected.parcelId}`} />
            </div>
            <div className="field-row">
              <label className="form-label">Current crop</label>
              <select value={editCrop} onChange={e => setEditCrop(e.target.value)}>
                <option value="">— Unassigned —</option>
                {Object.keys(CROP_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="field-row">
              <label className="form-label">Variety</label>
              <input value={editVariety} onChange={e => setEditVariety(e.target.value)} placeholder="e.g. Extase, Graham" />
            </div>
            <div className="field-row">
              <label className="form-label">Notes</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder="Soil type, SFI options, drainage issues…"
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: '0.5rem' }}>
              <button className="btn-primary" onClick={saveField}>Save field</button>
              {selected.field && (
                <button className="btn-cancel" onClick={deleteField}>Remove</button>
              )}
            </div>

            {/* Records summary */}
            {selected.field && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Records this field</div>
                {(() => {
                  const name = selected.field.name;
                  const sprays = db.sprays?.filter(s => s.field === name) || [];
                  const ferts = db.fertilisers?.filter(f => f.field === name) || [];
                  return (
                    <div style={{ fontSize: 13 }}>
                      <div>💧 {sprays.length} spray application{sprays.length !== 1 ? 's' : ''}</div>
                      <div>🌱 {ferts.length} fertiliser application{ferts.length !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Named fields table */}
      {db.fields.filter(f => f.parcel).length > 0 && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="card-title">Named Fields</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field name</th>
                  <th>Parcel</th>
                  <th>Area (ha)</th>
                  <th>Crop</th>
                  <th>Variety</th>
                  <th>Sprays</th>
                  <th>Fertiliser</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {db.fields.filter(f => f.parcel).sort((a,b) => a.name.localeCompare(b.name)).map(f => {
                  const sprays = db.sprays?.filter(s => s.field === f.name) || [];
                  const ferts = db.fertilisers?.filter(fe => fe.field === f.name) || [];
                  return (
                    <tr
                      key={f.parcel}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelected({ parcelId: f.parcel!, sheetId: f.sheetId || '', areaHa: f.area, field: f });
                        setEditName(f.name); setEditCrop(f.crop); setEditVariety(f.variety || ''); setEditNotes(f.notes);
                      }}
                    >
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: cropColor(f.crop), marginRight: 6 }} />
                        {f.name}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{f.sheetId}/{f.parcel}</td>
                      <td>{f.area.toFixed(2)}</td>
                      <td>{f.crop || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{f.variety || '—'}</td>
                      <td>{sprays.length}</td>
                      <td>{ferts.length}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{f.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
