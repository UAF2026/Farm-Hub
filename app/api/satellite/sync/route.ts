/**
 * POST /api/satellite/sync
 *
 * Fetches Sentinel-2 NDVI for arable fields and stores results in Supabase.
 * Processes fields in batches of 5 (use ?batch=0, ?batch=1 etc) to stay
 * within Vercel's 60s function timeout.
 *
 * Query params:
 *   ?from=YYYY-MM-DD  (default: 90 days ago)
 *   ?to=YYYY-MM-DD    (default: today)
 *   ?batch=N          (0-indexed batch number, default 0)
 *   ?parcel=SU7291+6235  (optional: sync a single parcel only)
 *
 * GET /api/satellite/sync — return stored NDVI rows for the UI
 *   ?cropYear=2025/26
 *   ?parcel=SU7291+6235
 *   ?limit=500
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
export const maxDuration = 60;

interface FieldRecord {
  name: string;
  rpaParcel?: string;
  sheetId?: string;
  parcel?: string;
  crop: string;
  variety?: string;
  status: string;
  area?: number;
}

const BATCH_SIZE = 5;

export async function POST(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam   = req.nextUrl.searchParams.get('to');
  const parcelFilter = req.nextUrl.searchParams.get('parcel');
  const batchIndex   = parseInt(req.nextUrl.searchParams.get('batch') || '0');

  const today        = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const fromDate = fromParam || ninetyDaysAgo;
  const toDate   = toParam   || today;

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

  // Filter to arable fields with RPA parcel refs
  const arableFields = allFields.filter((f: FieldRecord) => {
    const hasParcel = !!(f.rpaParcel || (f.sheetId && f.parcel));
    const isArable  = ['In crop','Active','Herbal ley','Cover crop'].includes(f.status);
    const rpaRef    = f.rpaParcel || (f.sheetId && f.parcel ? `${f.sheetId} ${f.parcel}` : '');
    if (parcelFilter && rpaRef !== parcelFilter) return false;
    return hasParcel && isArable;
  });

  const totalBatches = Math.ceil(arableFields.length / BATCH_SIZE);
  const batchFields  = arableFields.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);

  const results: Array<{ field: string; parcel: string; snapshots: number; error?: string }> = [];
  let totalStored = 0;
  let totalErrors = 0;

  for (const field of batchFields) {
    const rpaParcel = field.rpaParcel || `${field.sheetId} ${field.parcel}`;

    try {
      // Build boundary (OS grid approximation — instant, no external call)
      const boundary = await getOrFetchBoundary(rpaParcel, field.name, field.area ?? 10);
      if (!boundary?.bbox || !boundary?.geojson) {
        results.push({ field: field.name, parcel: rpaParcel, snapshots: 0, error: 'Could not build bbox from OS grid ref' });
        totalErrors++;
        continue;
      }

      // Fetch NDVI from Copernicus with a per-field timeout
      const ndviData = await Promise.race([
        fetchNdviForField(boundary.bbox, boundary.geojson, fromDate, toDate),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Copernicus timeout (20s)')), 20000)
        ),
      ]);

      if (ndviData.length === 0) {
        results.push({ field: field.name, parcel: rpaParcel, snapshots: 0, error: 'No cloud-free captures in date range' });
        continue;
      }

      const snapshots: NdviSnapshot[] = ndviData.map(d => ({
        field_name:      field.name,
        rpa_parcel:      rpaParcel,
        capture_date:    d.date,
        crop_year:       dateToUkCropYear(d.date),
        crop:            field.crop || '',
        variety:         field.variety || '',
        ndvi_mean:       d.ndvi_mean,
        ndvi_min:        d.ndvi_min,
        ndvi_max:        d.ndvi_max,
        ndvi_std:        d.ndvi_std,
        cloud_cover_pct: d.cloud_cover_pct,
        growth_stage:    inferGrowthStage(d.date, field.crop || ''),
        source:          'sentinel-2',
      }));

      const { stored } = await storeNdviSnapshots(snapshots);
      totalStored += stored;
      results.push({ field: field.name, parcel: rpaParcel, snapshots: stored });

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
    batch: batchIndex,
    totalBatches,
    hasMore: batchIndex + 1 < totalBatches,
    fieldsInBatch: batchFields.length,
    fieldsTotal: arableFields.length,
    snapshotsStored: totalStored,
    errors: totalErrors,
    results,
  });
}

// GET — return stored NDVI rows for the UI
export async function GET(req: NextRequest) {
  const parcel   = req.nextUrl.searchParams.get('parcel');
  const cropYear = req.nextUrl.searchParams.get('cropYear');
  const limit    = parseInt(req.nextUrl.searchParams.get('limit') || '500');

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let query = supabase
    .from('satellite_ndvi')
    .select('*')
    .order('capture_date', { ascending: true })
    .limit(limit);

  if (parcel)   query = query.eq('rpa_parcel', parcel);
  if (cropYear) query = query.eq('crop_year', cropYear);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
