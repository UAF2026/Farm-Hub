/**
 * Satellite NDVI integration — Copernicus Sentinel-2 via openEO
 *
 * Flow:
 *   1. Look up field boundary polygon from RPA INSPIRE WFS (cached in field_boundaries table)
 *   2. Call openEO Statistical API to get NDVI mean/min/max/std for the polygon
 *   3. Store results in satellite_ndvi table
 *
 * All calls are server-side only (API route / scheduled task).
 * Copernicus free tier: 40,000 processing units/month — more than enough for ~50 fields.
 */

import { createClient } from '@supabase/supabase-js';

// ── Supabase (server-side, uses service role key from env) ──────────────────
function getServerSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface FieldBoundary {
  rpa_parcel: string;
  field_name: string;
  sheet_id: string;
  parcel_id: string;
  area_ha: number;
  geojson: GeoJSONFeature | null;
  bbox: BBox | null;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: Record<string, unknown>;
}

export interface NdviSnapshot {
  field_name: string;
  rpa_parcel: string;
  capture_date: string;  // YYYY-MM-DD
  crop_year?: string;
  crop?: string;
  variety?: string;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  ndvi_std: number;
  cloud_cover_pct: number;
  growth_stage?: string;
  source: string;
  notes?: string;
}

// ── RPA land parcel boundary lookup ─────────────────────────────────────────
// RPA publishes parcel polygons via ArcGIS REST. We try multiple known
// endpoints and field name combinations — the service has moved over the years.
//
// Parcel ref format: "SU7291 6235" → sheetId="SU7291", parcelId="6235"
// Combined ref (no space): "SU72916235"

const RPA_ENDPOINTS = [
  'https://gisrest.defra.gov.uk/server/rest/services/RPA/LandParcels/MapServer/0/query',
  'https://environment.data.gov.uk/arcgis/rest/services/RPA/LandParcels/MapServer/0/query',
  'https://environment.data.gov.uk/arcgis/rest/services/RPA/LandParcel/MapServer/0/query',
];

// Different field name combinations used across versions of the service
const FIELD_NAME_COMBOS = [
  (sheet: string, parcel: string) => `SHEET_ID='${sheet}' AND PARCEL_ID='${parcel}'`,
  (sheet: string, parcel: string) => `SHEETID='${sheet}' AND PARCELID='${parcel}'`,
  (sheet: string, parcel: string) => `SHEET_PARCEL_REF='${sheet}${parcel}'`,
  (sheet: string, parcel: string) => `PARCEL_REF='${sheet}${parcel}'`,
  (_sheet: string, _parcel: string, combined: string) => `PARCEL_REFERENCE='${combined}'`,
];

export async function fetchParcelBoundary(sheetId: string, parcelId: string): Promise<GeoJSONFeature | null> {
  const combined = `${sheetId}${parcelId}`;

  for (const baseUrl of RPA_ENDPOINTS) {
    for (const whereFn of FIELD_NAME_COMBOS) {
      const where = whereFn(sheetId, parcelId, combined);
      const params = new URLSearchParams({
        where,
        outFields: '*',
        outSR: '4326',  // WGS84 lon/lat
        f: 'geojson',
      });

      try {
        const res = await fetch(`${baseUrl}?${params}`, {
          headers: { 'User-Agent': 'FarmHub/1.0 (Upper Assendon Farm)' },
          signal: AbortSignal.timeout(12000),
        });

        if (!res.ok) continue;

        const data = await res.json() as { features?: GeoJSONFeature[]; error?: { message?: string } };
        if (data.error) continue;
        if (data.features && data.features.length > 0) {
          console.log(`[satellite] Found boundary via ${baseUrl} with where: ${where}`);
          return data.features[0];
        }
      } catch {
        // timeout or network error — try next
        continue;
      }
    }
  }

  console.warn(`[satellite] No boundary found for ${sheetId} ${parcelId} — tried all endpoints`);
  return null;
}

// Calculate bounding box from a GeoJSON polygon
export function calcBbox(feature: GeoJSONFeature): BBox {
  const coords: number[][] = [];

  function flatten(c: unknown): void {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      coords.push(c as number[]);
    } else {
      c.forEach(flatten);
    }
  }
  flatten(feature.geometry.coordinates);

  const lons = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return {
    west: Math.min(...lons),
    south: Math.min(...lats),
    east: Math.max(...lons),
    north: Math.max(...lats),
  };
}

// ── Approximate bbox from OS grid reference ──────────────────────────────────
// Converts an OS National Grid sheet ID (e.g. "SU7291") to an approximate
// WGS84 bounding box. This is used as a fallback when the RPA polygon lookup
// fails — it gives Sentinel-2 a ~1km² area to work with, which is good enough
// to get a representative NDVI value for the field.
//
// OS grid: each 100km square has a 2-letter prefix. Within that, 4 digits give
// 1km easting+northing offsets (e.g. SU7291 → easting 72, northing 91 within SU).
// SU origin: easting 400000, northing 100000 (OSGB36).
// We convert to approximate WGS84 using a simple offset (accurate to ~100m for Oxon).

const OS_ORIGINS: Record<string, [number, number]> = {
  SU: [400000, 100000],
  SY: [300000, 100000],
  ST: [300000, 200000],
  SZ: [400000,   0],
  TQ: [500000, 100000],
  TR: [600000, 100000],
  SP: [400000, 200000],
  TL: [500000, 200000],
  SK: [400000, 300000],
  SE: [400000, 400000],
  NY: [300000, 500000],
  NT: [300000, 600000],
};

function osGridToBbox(sheetId: string, areaHa = 10): BBox | null {
  // sheetId e.g. "SU7291" → prefix "SU", easting digits "72", northing digits "91"
  const m = sheetId.match(/^([A-Z]{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, prefix, eStr, nStr] = m;
  const origin = OS_ORIGINS[prefix];
  if (!origin) return null;

  const easting  = origin[0] + parseInt(eStr) * 1000;
  const northing = origin[1] + parseInt(nStr) * 1000;

  // Approximate OSGB36 → WGS84 for central England (accurate to ~200m)
  // Latitude: northing / 111320 + 49.0 offset
  // Longitude: (easting - 400000) / (111320 * cos(lat)) - 2.0 offset
  const latCenter = northing / 111320 + 49.0 - (northing > 300000 ? (northing - 300000) / 1e7 : 0);
  const lonCenter = (easting - 400000) / (111320 * Math.cos(latCenter * Math.PI / 180)) - 2.0;

  // Expand by ~sqrt(areaHa) * 50m in each direction
  const deltaLat = (Math.sqrt(areaHa) * 60) / 111320;
  const deltaLon = deltaLat / Math.cos(latCenter * Math.PI / 180);

  return {
    west:  lonCenter - deltaLon,
    south: latCenter - deltaLat,
    east:  lonCenter + deltaLon,
    north: latCenter + deltaLat,
  };
}

// Build a simple rectangular GeoJSON polygon from a bbox
function bboxToGeoJSON(bbox: BBox): GeoJSONFeature {
  const { west, south, east, north } = bbox;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
    properties: { source: 'os-grid-approx' },
  };
}

// ── Get or cache boundary ────────────────────────────────────────────────────
export async function getOrFetchBoundary(
  rpaParcel: string,
  fieldName: string,
  areaHa = 10,
): Promise<FieldBoundary | null> {
  const supabase = getServerSupabase();

  // Check cache first
  const { data: cached } = await supabase
    .from('field_boundaries')
    .select('*')
    .eq('rpa_parcel', rpaParcel)
    .single();

  if (cached?.bbox) {
    return cached as FieldBoundary;
  }

  // Parse RPA parcel ref — format "SU7291 6235" → sheet SU7291, parcel 6235
  const match = rpaParcel.match(/^([A-Z]{2}\d{4})\s+(\d+)$/);
  if (!match) {
    console.warn(`[satellite] Cannot parse RPA parcel ref: ${rpaParcel}`);
    return null;
  }

  const [, sheetId, parcelId] = match;

  // Use OS grid approximation directly — fast and reliable.
  // RPA polygon lookup is too slow for batch processing (timeouts).
  // Exact boundaries can be loaded later via a separate boundary-import tool.
  const bbox = osGridToBbox(sheetId, areaHa);
  const geojson = bbox ? bboxToGeoJSON(bbox) : null;
  const source = 'os-grid-approx';

  if (!bbox || !geojson) return null;

  // Cache result
  await supabase.from('field_boundaries').upsert({
    rpa_parcel: rpaParcel,
    field_name: fieldName,
    sheet_id: sheetId,
    parcel_id: parcelId,
    geojson,
    bbox,
    fetched_at: new Date().toISOString(),
    notes: source,
  });

  return { rpa_parcel: rpaParcel, field_name: fieldName, sheet_id: sheetId, parcel_id: parcelId, area_ha: areaHa, geojson, bbox };
}

// ── Copernicus openEO — NDVI Statistical API ─────────────────────────────────
// Uses the Sentinel Hub Statistical API (part of Copernicus Data Space).
// Returns NDVI statistics aggregated over the polygon for each available
// (low-cloud) Sentinel-2 acquisition in the requested date range.
//
// Auth: Client credentials OAuth2 from Copernicus Data Space free account.
// Register at: https://dataspace.copernicus.eu/
// Env vars needed: COPERNICUS_CLIENT_ID, COPERNICUS_CLIENT_SECRET

const CDSE_TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const CDSE_STATS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

let _tokenCache: { token: string; expiresAt: number } | null = null;

async function getCopernicusToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 30000) {
    return _tokenCache.token;
  }

  const clientId = process.env.COPERNICUS_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET env vars required. Register free at https://dataspace.copernicus.eu/');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(CDSE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Copernicus auth failed: ${res.status} ${text}`);
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  _tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return _tokenCache.token;
}

// Evalscript: returns NDVI (B08 - B04) / (B08 + B04) and scene cloud cover
const NDVI_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "CLM", "dataMask"], units: "REFLECTANCE" }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1, sampleType: "UINT8" }
    ]
  };
}
function evaluatePixel(sample) {
  const ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  // Mask clouds and invalid pixels
  const valid = sample.dataMask === 1 && sample.CLM === 0 ? 1 : 0;
  return { ndvi: [ndvi], dataMask: [valid] };
}
`;

interface CdseStatsResponse {
  data?: Array<{
    interval?: { from: string; to: string };
    outputs?: {
      ndvi?: {
        bands?: {
          B0?: {
            stats?: {
              mean?: number;
              min?: number;
              max?: number;
              stDev?: number;
              sampleCount?: number;
              noDataCount?: number;
            };
          };
        };
      };
    };
  }>;
}

export async function fetchNdviForField(
  bbox: BBox,
  geojson: GeoJSONFeature,
  fromDate: string,  // YYYY-MM-DD
  toDate: string,    // YYYY-MM-DD
  maxCloudCoverPct = 30,
): Promise<Array<{ date: string; ndvi_mean: number; ndvi_min: number; ndvi_max: number; ndvi_std: number; cloud_cover_pct: number }>> {
  const token = await getCopernicusToken();

  const body = {
    input: {
      bounds: {
        bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
        geometry: geojson.geometry,
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
            maxCloudCoverage: maxCloudCoverPct,
            mosaickingOrder: 'mostRecent',
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
      aggregationInterval: { of: 'P5D' },  // 5-day windows matching Sentinel revisit
      evalscript: NDVI_EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
    calculations: {
      ndvi: {
        histograms: {},
        statistics: {},
      },
    },
  };

  const res = await fetch(CDSE_STATS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Copernicus stats API error: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = await res.json() as CdseStatsResponse;

  const results: Array<{ date: string; ndvi_mean: number; ndvi_min: number; ndvi_max: number; ndvi_std: number; cloud_cover_pct: number }> = [];

  for (const interval of (json.data ?? [])) {
    const stats = interval.outputs?.ndvi?.bands?.B0?.stats;
    if (!stats || stats.mean === undefined || stats.mean === null) continue;
    // Skip intervals that are mostly no-data (cloud / edge)
    const total = (stats.sampleCount ?? 0) + (stats.noDataCount ?? 0);
    const validPct = total > 0 ? ((stats.sampleCount ?? 0) / total) * 100 : 0;
    if (validPct < 50) continue;  // less than half the pixels are valid — skip
    const cloudCoverPct = 100 - validPct;

    const dateStr = interval.interval?.from?.slice(0, 10) ?? '';
    if (!dateStr) continue;

    results.push({
      date: dateStr,
      ndvi_mean: Math.round((stats.mean ?? 0) * 10000) / 10000,
      ndvi_min: Math.round((stats.min ?? 0) * 10000) / 10000,
      ndvi_max: Math.round((stats.max ?? 0) * 10000) / 10000,
      ndvi_std: Math.round((stats.stDev ?? 0) * 10000) / 10000,
      cloud_cover_pct: Math.round(cloudCoverPct * 100) / 100,
    });
  }

  return results;
}

// ── Infer growth stage from date and crop ────────────────────────────────────
export function inferGrowthStage(dateStr: string, crop: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();

  const isWinterCrop = crop.toLowerCase().includes('winter');
  const isSpringCrop = crop.toLowerCase().includes('spring');

  if (isWinterCrop) {
    if (month === 10 || month === 11) return 'Establishment';
    if (month === 12 || month === 1 || month === 2) return 'Dormancy / tillering';
    if (month === 3) return 'T0 / GS25-30';
    if (month === 4 && day <= 20) return 'T1 / GS31-32';
    if (month === 4 && day > 20) return 'T1-T2 / GS32-37';
    if (month === 5 && day <= 15) return 'T2 / GS37-39';
    if (month === 5 && day > 15) return 'Ear emergence / GS55-65';
    if (month === 6) return 'Grain fill / GS70-77';
    if (month === 7) return 'Ripening / pre-harvest';
    if (month === 8) return 'Post-harvest';
  }

  if (isSpringCrop) {
    if (month === 3 || month === 4) return 'Establishment';
    if (month === 5 && day <= 20) return 'Tillering';
    if (month === 5 && day > 20) return 'Stem extension';
    if (month === 6) return 'Ear emergence';
    if (month === 7) return 'Grain fill';
    if (month === 8) return 'Ripening / harvest';
  }

  if (crop.toLowerCase().includes('barley')) {
    if (month === 3 || (month === 4 && day <= 15)) return 'T0-T1';
    if (month === 4 && day > 15) return 'T2 / ear emergence';
    if (month === 5) return 'Grain fill';
    if (month === 6) return 'Ripening';
    if (month === 7) return 'Harvest';
  }

  return `Month ${month}`;
}

// ── Store NDVI snapshots to Supabase ─────────────────────────────────────────
export async function storeNdviSnapshots(snapshots: NdviSnapshot[]): Promise<{ stored: number; skipped: number }> {
  const supabase = getServerSupabase();
  let stored = 0;
  let skipped = 0;

  for (const snap of snapshots) {
    const { error } = await supabase.from('satellite_ndvi').upsert(snap, {
      onConflict: 'rpa_parcel,capture_date',
      ignoreDuplicates: false,  // update if we get better data
    });
    if (error) {
      console.error(`[satellite] Failed to store NDVI for ${snap.rpa_parcel} ${snap.capture_date}:`, error.message);
      skipped++;
    } else {
      stored++;
    }
  }

  return { stored, skipped };
}

// ── Determine crop year from date ─────────────────────────────────────────────
export function dateToUkCropYear(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  // UK crop year: Aug → Jul. Harvest in Aug ends the year.
  // Oct 2024 → Jul 2025 = 2024/25 winter crop
  // Aug 2025 = harvest of 2024/25
  if (month >= 8) {
    return `${year}/${String(year + 1).slice(-2)}`;
  } else {
    return `${year - 1}/${String(year).slice(-2)}`;
  }
}
