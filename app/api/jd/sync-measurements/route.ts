import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidToken, jdFetch } from '@/lib/johnDeere';
import type { JdOperation, JdOperationMeasurements } from '@/lib/types';

// Sync per-operation measurements from John Deere — actual application rates
// in kg/ha, total kg applied, areas covered, seeding rates, harvest yields,
// tillage depths. Writes results onto each op as op.measurements so the
// Farm Assurance import can populate rate/area/total fields.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_SECRET = process.env.API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ROW_ID = 'farmhub_main';

interface DeereLink {
  rel?: string;
  uri?: string;
}

interface DeereOpDetail {
  id: string;
  fieldOperationType?: string;
  links?: DeereLink[];
}

interface DeereEventMeasurement {
  value?: number;
  unitId?: string;
  variableRepresentation?: string;
}

interface DeereProductTotal {
  area?: DeereEventMeasurement;
  totalMaterial?: DeereEventMeasurement;
  averageMaterial?: DeereEventMeasurement;
  averageSpeed?: DeereEventMeasurement;
  appliedArea?: DeereEventMeasurement;
}

interface DeereVarietyTotal extends DeereProductTotal {
  name?: string;
}

interface DeereMeasurementBody {
  area?: DeereEventMeasurement;
  totalMaterial?: DeereEventMeasurement;
  averageMaterial?: DeereEventMeasurement;
  averageDepth?: DeereEventMeasurement;
  averageYield?: DeereEventMeasurement;
  applicationProductTotals?: DeereProductTotal[];
  varietyTotals?: DeereVarietyTotal[];
}

function checkAuth(req: NextRequest): NextResponse | null {
  if (!API_SECRET) return null;
  const url = new URL(req.url);
  const provided = req.headers.get('x-api-secret') || url.searchParams.get('secret');
  if (provided !== API_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorised. Pass ?secret=… or x-api-secret header.' },
      { status: 401 }
    );
  }
  return null;
}

// Convert Deere unit codes ("kg1ha-1", "km1hr-1", "t1ha-1") to plain text.
function prettyUnit(unitId?: string): string {
  if (!unitId) return '';
  const map: Record<string, string> = {
    'kg1ha-1': 'kg/ha',
    'l1ha-1': 'l/ha',
    't1ha-1': 't/ha',
    'km1hr-1': 'km/h',
    kg: 'kg',
    l: 'l',
    t: 't',
    ha: 'ha',
    cm: 'cm',
  };
  return map[unitId] || unitId;
}

async function pMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= items.length) return;
          results[i] = await fn(items[i], i);
        }
      })()
    );
  }
  await Promise.all(workers);
  return results;
}

// Pull the measurement endpoints relevant to an op type and project the
// summary fields we care about onto a JdOperationMeasurements record.
async function fetchMeasurements(
  op: JdOperation,
  token: string,
  apiBase: string
): Promise<{ measurements?: JdOperationMeasurements; error?: string }> {
  try {
    const detail = await jdFetch<DeereOpDetail>(
      `https://api.deere.com/platform/fieldOperations/${op.id}`,
      token,
      apiBase
    );
    const links = detail.links || [];
    const linkFor = (rel: string) => links.find((l) => l.rel === rel)?.uri;

    const out: JdOperationMeasurements = {
      fetchedAt: new Date().toISOString(),
    };

    // Helper: try to fetch a measurement endpoint without crashing the whole sync.
    const tryFetch = async (uri: string | undefined): Promise<DeereMeasurementBody | null> => {
      if (!uri) return null;
      try {
        return await jdFetch<DeereMeasurementBody>(uri, token, apiBase);
      } catch {
        return null;
      }
    };

    if (op.type === 'application') {
      const result = await tryFetch(linkFor('applicationRateResult'));
      const target = await tryFetch(linkFor('applicationRateTarget'));
      const productTotals = result?.applicationProductTotals?.[0];
      if (productTotals) {
        if (productTotals.appliedArea?.value != null) out.area = productTotals.appliedArea.value;
        else if (productTotals.area?.value != null) out.area = productTotals.area.value;
        if (productTotals.totalMaterial?.value != null) {
          out.totalApplied = productTotals.totalMaterial.value;
          out.totalUnit = prettyUnit(productTotals.totalMaterial.unitId);
        }
        if (productTotals.averageMaterial?.value != null) {
          out.ratePerHa = productTotals.averageMaterial.value;
          out.rateUnit = prettyUnit(productTotals.averageMaterial.unitId);
        }
        if (productTotals.averageSpeed?.value != null) {
          out.averageSpeedKmh = productTotals.averageSpeed.value;
        }
      }
      const targetTotals = target?.applicationProductTotals?.[0];
      if (targetTotals?.averageMaterial?.value != null) {
        out.targetRatePerHa = targetTotals.averageMaterial.value;
      }
    } else if (op.type === 'seeding') {
      const result = await tryFetch(linkFor('seedingRateResult'));
      if (result?.area?.value != null) out.area = result.area.value;
      if (result?.totalMaterial?.value != null) {
        out.totalApplied = result.totalMaterial.value;
        out.totalUnit = prettyUnit(result.totalMaterial.unitId);
      }
      if (result?.averageMaterial?.value != null) {
        out.ratePerHa = result.averageMaterial.value;
        out.rateUnit = prettyUnit(result.averageMaterial.unitId);
      }
    } else if (op.type === 'harvest') {
      const yieldResult = await tryFetch(linkFor('harvestYieldResult'));
      if (yieldResult?.area?.value != null) out.area = yieldResult.area.value;
      if (yieldResult?.totalMaterial?.value != null) {
        out.totalApplied = yieldResult.totalMaterial.value;
        out.totalUnit = prettyUnit(yieldResult.totalMaterial.unitId);
      }
      if (yieldResult?.averageMaterial?.value != null) {
        out.yieldTPerHa = yieldResult.averageMaterial.value;
        out.rateUnit = prettyUnit(yieldResult.averageMaterial.unitId);
      } else if (yieldResult?.averageYield?.value != null) {
        out.yieldTPerHa = yieldResult.averageYield.value;
        out.rateUnit = prettyUnit(yieldResult.averageYield.unitId);
      }
    } else if (op.type === 'tillage') {
      const target = await tryFetch(linkFor('tillageDepthTarget'));
      if (target?.averageDepth?.value != null) out.tillageDepthCm = target.averageDepth.value;
    }

    // No useful data extracted — don't pollute the op with an empty object.
    const hasAny =
      out.area != null ||
      out.ratePerHa != null ||
      out.totalApplied != null ||
      out.tillageDepthCm != null ||
      out.yieldTPerHa != null;
    if (!hasAny) return { measurements: undefined };

    return { measurements: out };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function POST(req: NextRequest) {
  return run(req);
}
export async function GET(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const limit = parseInt(url.searchParams.get('limit') || '0', 10);
  const onlyType = url.searchParams.get('type'); // optional: 'application' | 'seeding' | …

  try {
    const { token, auth } = await getValidToken();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: existing, error: readErr } = await supabase
      .from('farmdata')
      .select('data')
      .eq('id', ROW_ID)
      .single();
    if (readErr) throw new Error(`Supabase read failed: ${readErr.message}`);
    const farmData =
      ((existing as { data?: { jdOperations?: JdOperation[] } } | null)?.data as
        | { jdOperations?: JdOperation[] }
        | undefined) || {};
    const ops: JdOperation[] = farmData.jdOperations || [];
    if (ops.length === 0) {
      return NextResponse.json({ error: 'No JD operations stored — run /api/jd/sync-write first.' });
    }

    // Decide which ops need measurement fetches.
    let candidates = ops.filter((op) => {
      if (onlyType && op.type !== onlyType) return false;
      if (force) return true;
      return !op.measurements;
    });
    if (limit > 0) candidates = candidates.slice(0, limit);

    let okCount = 0;
    let skipCount = 0;
    let errCount = 0;
    const errors: string[] = [];

    await pMap(candidates, 6, async (op) => {
      const { measurements, error } = await fetchMeasurements(op, token, auth.apiBase);
      if (error) {
        errCount++;
        if (errors.length < 5) errors.push(`${op.id} (${op.type}): ${error}`);
        return;
      }
      if (!measurements) {
        skipCount++;
        return;
      }
      op.measurements = measurements;
      okCount++;
    });

    // Persist updated ops back. We rewrite the whole array — simpler and the
    // JSONB blob is small enough that this is fine.
    const updatedFarmData = { ...farmData, jdOperations: ops };
    const { error: saveErr } = await supabase
      .from('farmdata')
      .upsert({ id: ROW_ID, data: updatedFarmData, updated_at: new Date().toISOString() });
    if (saveErr) {
      return NextResponse.json(
        { error: 'Measurements fetched but Supabase save failed', detail: saveErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      candidatesProcessed: candidates.length,
      withMeasurements: okCount,
      noUsefulData: skipCount,
      errors: errCount,
      errorsSample: errors,
      totalOpsWithMeasurementsNow: ops.filter((o) => o.measurements).length,
      totalOps: ops.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
