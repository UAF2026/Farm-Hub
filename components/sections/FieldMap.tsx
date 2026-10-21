'use client';

import { useEffect, useRef, useState } from 'react';
import type { FarmData, MasterField } from '@/lib/types';
import { findFieldByParcel, currentCrop, recordsForField, cropColour, activeFields } from '@/lib/fields';

// The RPA parcels on our SBI (public/land-parcels.geojson), coloured by this
// season's crop. Names, crops and everything else come from the master field
// list (data.fieldRegister); edit fields on the Fields tab, crops on the
// Cropping Plan.

interface Props {
  db: FarmData;
}

/* ─── Load Leaflet from CDN ─────────────────────────────────────────────────── */
let leafletLoaded = false;
function loadLeaflet(): Promise<any> {
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

interface ParcelInfo {
  parcelId: string;
  sheetId: string;
  areaHa: number;
  field: MasterField | null;   // the field in the master list that owns this parcel
}

export default function FieldMap({ db }: Props) {
  const mapRef = useRef<any>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<any>(null);
  const geoLayerRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const geojsonRef = useRef<any>(null);
  const [basemap, setBasemap] = useState<'osm' | 'sat'>('sat');
  const [selected, setSelected] = useState<ParcelInfo | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [parcelKeys, setParcelKeys] = useState<Set<string>>(new Set());
  const dbRef = useRef(db);
  dbRef.current = db;

  const fieldFor = (sheet: string, parcel: string) => findFieldByParcel(dbRef.current.fieldRegister || [], sheet, parcel) || null;

  /* ─── Init map ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current || !mapDivRef.current) return;
    loadLeaflet().then((L) => {
      const map = L.map(mapDivRef.current!, { center: [51.588, -0.962], zoom: 14, zoomControl: true });
      mapRef.current = map;
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 });
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri World Imagery', maxZoom: 19 });
      const satLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { attribution: '', maxZoom: 19, opacity: 0.7 });
      layerRef.current = { osm, sat, satLabels };
      sat.addTo(map);
      satLabels.addTo(map);
      fetch('/land-parcels.geojson')
        .then(r => r.json())
        .then(geojson => {
          geojsonRef.current = geojson;
          setParcelKeys(new Set(geojson.features.map((ft: any) => `${ft.properties.SHEET_ID} ${ft.properties.PARCEL_ID}`)));
          addGeoJSON(L, map, geojson);
          setMapReady(true);
        })
        .catch(err => console.error('GeoJSON load failed', err));
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Refresh colours and labels when the field list or plans change ── */
  useEffect(() => {
    if (!mapReady || !geoLayerRef.current) return;
    geoLayerRef.current.eachLayer((layer: any) => geoLayerRef.current.resetStyle(layer));
    addLabels((window as any).L, geojsonRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.fieldRegister, db.croppingPlans, mapReady]);

  function addGeoJSON(L: any, map: any, geojson: any) {
    labelsLayerRef.current = L.layerGroup().addTo(map);
    const geo = L.geoJSON(geojson, {
      style: (feature: any) => styleFeature(feature),
      onEachFeature: (feature: any, layer: any) => {
        layer.on('click', () => {
          const { PARCEL_ID, SHEET_ID, AREA_HA } = feature.properties;
          setSelected({ parcelId: PARCEL_ID, sheetId: SHEET_ID, areaHa: parseFloat(AREA_HA), field: fieldFor(SHEET_ID, PARCEL_ID) });
        });
        layer.on('mouseover', () => layer.setStyle({ weight: 3, opacity: 1 }));
        layer.on('mouseout', () => geo.resetStyle(layer));
      },
    }).addTo(map);
    geoLayerRef.current = geo;
    addLabels(L, geojson);
    map.fitBounds(geo.getBounds(), { padding: [20, 20] });
    // Names only when zoomed in enough to read them.
    const toggleLabels = () => {
      const show = map.getZoom() >= 14;
      if (show && !map.hasLayer(labelsLayerRef.current)) labelsLayerRef.current.addTo(map);
      if (!show && map.hasLayer(labelsLayerRef.current)) map.removeLayer(labelsLayerRef.current);
    };
    map.on('zoomend', toggleLabels);
    toggleLabels();
  }

  function styleFeature(feature: any) {
    const f = fieldFor(feature.properties.SHEET_ID, feature.properties.PARCEL_ID);
    const farmed = !!f && f.status === 'active';
    return {
      fillColor: farmed ? cropColour(currentCrop(f!, dbRef.current)?.crop) : '#888888',
      fillOpacity: farmed ? 0.55 : 0.2,
      color: '#ffffff',
      weight: 1.5,
      opacity: 0.8,
    };
  }

  function addLabels(L: any, geojson: any) {
    if (!L || !geojson || !labelsLayerRef.current) return;
    labelsLayerRef.current.clearLayers();
    const done = new Set<string>();
    geojson.features.forEach((feature: any) => {
      const f = fieldFor(feature.properties.SHEET_ID, feature.properties.PARCEL_ID);
      if (!f || f.status !== 'active' || done.has(f.id)) return;   // one label per field
      done.add(f.id);
      const coords = feature.geometry.coordinates[0];
      let cx = 0, cy = 0;
      coords.forEach(([lon, lat]: number[]) => { cx += lon; cy += lat; });
      cx /= coords.length; cy /= coords.length;
      const name = f.name.replace(/[<>&"]/g, '');
      labelsLayerRef.current.addLayer(L.marker([cy, cx], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:rgba(0,0,0,0.55);color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none;">${name}</div>`,
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }));
    });
  }

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
    if (geoLayerRef.current) geoLayerRef.current.bringToFront();
    setBasemap(to);
  }

  /* ─── Summary ─────────────────────────────────────────────────────────── */
  const onMap = activeFields(db).filter(f => f.rpaParcels.some(p => parcelKeys.has(p)));
  const cropArea: Record<string, number> = {};
  onMap.forEach(f => { const c = currentCrop(f, db)?.crop || 'Not set'; cropArea[c] = (cropArea[c] || 0) + f.areaHa; });
  const legend = Object.entries(cropArea).sort((a, b) => b[1] - a[1]);
  const totalFarmed = activeFields(db).reduce((a, f) => a + f.areaHa, 0);

  const sel = selected?.field || null;
  const selCrop = sel ? currentCrop(sel, db) : null;
  const sprays = sel ? recordsForField(sel, db.sprays) : [];
  const ferts = sel ? recordsForField(sel, db.fertilisers) : [];

  return (
    <>
      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Fields on the map</div><div className="metric-value">{onMap.length}</div><div className="metric-sub">on our SBI</div></div>
        <div className="metric-card"><div className="metric-label">Area on the map</div><div className="metric-value">{Math.round(onMap.reduce((a, f) => a + f.areaHa, 0))} ha</div><div className="metric-sub">of {Math.round(totalFarmed)} ha farmed</div></div>
        {legend.slice(0, 2).map(([crop, ha]) => (
          <div key={crop} className="metric-card"><div className="metric-label">{crop}</div><div className="metric-value">{Math.round(ha)} ha</div><div className="metric-sub">this season, on the map</div></div>
        ))}
      </div>

      <div className="map-row">
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 4 }}>
            {(['sat', 'osm'] as const).map((b, i) => (
              <button key={b} onClick={() => switchBasemap(b)} style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: basemap === b ? 'var(--green)' : 'rgba(255,255,255,0.9)', color: basemap === b ? '#fff' : '#333',
                border: '1px solid rgba(0,0,0,0.2)', borderRadius: i ? '0 4px 4px 0' : '4px 0 0 4px',
              }}>{b === 'sat' ? 'Satellite' : 'Map'}</button>
            ))}
          </div>
          <div ref={mapDivRef} className="map-canvas" />
          {legend.length > 0 && (
            <div className="map-legend">
              {legend.map(([crop]) => (
                <div key={crop} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: cropColour(crop === 'Not set' ? '' : crop), border: '1px solid rgba(0,0,0,0.15)' }} />
                  <span>{crop}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
            Coloured by this season’s crop from the Cropping Plan. Tap a parcel to see its field. Bix Hall and Knowles land isn’t drawn: it’s on their SBIs.
          </div>
        </div>

        {selected && (
          <div className="card map-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="card-title" style={{ margin: 0 }}>{sel?.name || `Parcel ${selected.sheetId} ${selected.parcelId}`}</div>
              <button onClick={() => setSelected(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              RPA {selected.sheetId} {selected.parcelId} · {selected.areaHa.toFixed(2)} ha
            </div>
            {sel ? (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <div><strong>Field:</strong> {sel.areaHa.toFixed(2)} ha{sel.rpaParcels.length > 1 ? ` over ${sel.rpaParcels.length} parcels` : ''}</div>
                  <div><strong>Land:</strong> {sel.land || 'not set'}</div>
                  <div><strong>This season:</strong> {selCrop ? `${selCrop.crop}${selCrop.variety ? ` (${selCrop.variety})` : ''}` : 'not set'}</div>
                  <div><strong>Records:</strong> {sprays.length} sprays · {ferts.length} fertiliser</div>
                  {sel.status !== 'active' && <div style={{ color: 'var(--amber)' }}>{sel.status === 'not-ours' ? 'Not ours – RPA to correct' : 'Boundary offcut'}</div>}
                </div>
                <button className="btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={() => { window.location.hash = `fields/${sel.id}`; }}>
                  Open field page
                </button>
              </>
            ) : (
              <div className="empty">This parcel isn’t in the master field list. Tell Claude which field it belongs to.</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
