/**
 * POST /api/satellite/sync
 *
 * Fetches Sentinel-2 NDVI for all arable fields and stores results in Supabase.
 * Called by a daily/weekly scheduled task (or manually from the Hub UI).
 *
 * Query params:
 *   ?from=YYYY-MM-DD  (default: 90 days ago)
 *   ?to=YYYY-MM-DD    (default: today)
 *   ?parcel=SU7291+6235  (optional: sync a single parcel only)
 *   ?secret=xxx  (must match API_SECRET env var)
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY  (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *   COPERNICUS_CLIENT_ID
 *   COPERNICUS_CLIENT_SECRET
 *   API_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getOrFetchBoundary,
  fetchNdviForField,
  storeNdviSnapshots,
  inferGrowthStage,
  dateToUkCropYear,
  NdviSnapshot,
} from '@/lib/satellite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;  // 5 minutes — fetching many fields can take a while

const API_SECRET = process.env.API_SECRET;

interface FieldRecord {
  name: string;
  rpaParcel?: string;
  sheetId?: string;
  parcel?: string;
  crop: string;
  variety?: string;
  status: string;
}

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.nextUrl.searchParams.get('secret');
  if (API_SECRET && secret !== API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const parcelFilter = req.nextUrl.searchParams.get('parcel');

  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const fromDate = fromParam || ninetyDaysAgo;
  const toDate = toParam || today;

  // Load field list from farmdata
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: farmRow } = await supabase
    .from('farmdata')
    .select('data')
    .eq('id', 'farmhub_main')
    .single();

  if (!farmRow?.data?.fields) {
    return NextResponse.json({ error: 'No field data found in farmdata' }, { status: 404 });
  }

  const allFields: FieldRecord[] = farmRow.data.fields;

  // Only process fields with RPA parcel references and arable/crop status
  const arableFields = allFields.filter((f: FieldRecord) => {
    const hasParcel = !!(f.rpaParcel || (f.sheetId && f.parcel));
    const isArable = f.status === 'In crop' || f.status === 'Active' || f.status === 'Herbal ley' || f.status === 'Cover crop';
    const rpaRef = f.rpaParcel || (f.sheetId && f.parcel ? `${f.sheetId} ${f.parcel}` : '');
    if (parcelFilter && rpaRef !== parcelFilter) return false;
    return hasParcel && isArable;
  });

  const results: Array<{ field: string; parcel: string; snapshots: number; error?: string }> = [];
  let totalStored = 0;
  let totalErrors = 0;

  for (const field of arableFields) {
    const rpaParcel = field.rpaParcel || `${field.sheetId} ${field.parcel}`;

    try {
      // Get or fetch boundary polygon
      const boundary = await getOrFetchBoundary(rpaParcel, field.name);
      if (!boundary?.bbox || !boundary?.geojson) {
        results.push({ field: field.name, parcel: rpaParcel, snapshots: 0, error: 'No boundary found in RPA data' });
        totalErrors++;
        continue;
      }

      // Fetch NDVI time series from Copernicus
      const ndviData = await fetchNdviForField(
        boundary.bbox,
        boundary.geojson,
        fromDate,
        toDate,
      );

      if (ndviData.length === 0) {
        results.push({ field: field.name, parcel: rpaParcel, snapshots: 0, error: 'No cloud-free captures in date range' });
        continue;
      }

      // Build snapshot records
      const snapshots: NdviSnapshot[] = ndviData.map(d => ({
        field_name: field.name,
        rpa_parcel: rpaParcel,
        capture_date: d.date,
        crop_year: dateToUkCropYear(d.date),
        crop: field.crop || '',
        variety: field.variety || '',
        ndvi_mean: d.ndvi_mean,
        ndvi_min: d.ndvi_min,
        ndvi_max: d.ndvi_max,
        ndvi_std: d.ndvi_std,
        cloud_cover_pct: d.cloud_cover_pct,
        growth_stage: inferGrowthStage(d.date, field.crop || ''),
        source: 'sentinel-2',
      }));

      const { stored } = await storeNdviSnapshots(snapshots);
      totalStored += stored;
      results.push({ field: field.name, parcel: rpaParcel, snapshots: stored });

      // Small delay between fields to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ field: field.name, parcel: rpaParcel, snapshots: 0, error: msg });
      totalErrors++;
    }
  }

  return NextResponse.json({
    ok: true,
    fromDate,
    toDate,
    fieldsProcessed: arableFields.length,
    snapshotsStored: totalStored,
    errors: totalErrors,
    results,
  });
}

// GET — return existing NDVI data for the UI (no Copernicus call)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (API_SECRET && secret !== API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parcel = req.nextUrl.searchParams.get('parcel');
  const cropYear = req.nextUrl.searchParams.get('cropYear');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '500');

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let query = supabase
    .from('satellite_ndvi')
    .select('*')
    .order('capture_date', { ascending: true })
    .limit(limit);

  if (parcel) query = query.eq('rpa_parcel', parcel);
  if (cropYear) query = query.eq('crop_year', cropYear);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
