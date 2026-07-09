import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidToken, jdFetch } from '@/lib/johnDeere';
import type { JdOperation, JdOperationProduct } from '@/lib/types';

// Production sync — fetches per-field operations from John Deere and writes
// them into farmdata.jdOperations as structured records the Hub can read.
//
// Strategy:
//   1. Page through the org's fields, filtering out auto-generated junk names.
//   2. For each real field, fetch operations list (paginated).
//   3. Filter operations to startDate >= ?since (default: 2024-01-01).
//   4. For each filtered operation, fetch the detail body in parallel batches
//      (Deere's list response omits crop/variety/products — those only appear
//      on the per-operation GET).
//   5. Project into a clean JdOperation record and write the full set into
//      farmdata.jdOperations, replacing the previous snapshot.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel hobby plan max — request more if needed.

const API_SECRET = process.env.API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ROW_ID = 'farmhub_main';

interface LinkEntry {
  '@type'?: string;
  rel?: string;
  uri?: string;
}

interface JdField {
  id: string;
  name?: string;
  archived?: boolean;
}

interface JdFieldsResponse {
  total?: number;
  values?: JdField[];
  links?: LinkEntry[];
}

interface JdOperationListItem {
  id: string;
  fieldOperationType?: string;
  startDate?: string;
  endDate?: string;
}

interface JdOperationsListResponse {
  total?: number;
  values?: JdOperationListItem[];
  links?: LinkEntry[];
}

interface JdProductRaw {
  name?: string;
  productType?: string;
  tankMix?: boolean;
  brand?: string;
}

interface JdMachineRaw {
  vin?: string;
  name?: string;
  machineId?: number;
}

interface JdTillageProductRaw {
  tillageType?: string;
}

interface JdOperationDetail {
  id: string;
  fieldOperationType?: string;
  startDate?: string;
  endDate?: string;
  cropSeason?: string;
  cropName?: string;
  varieties?: JdProductRaw[];
  products?: JdProductRaw[];
  tillageProducts?: JdTillageProductRaw[];
  fieldOperationMachines?: JdMachineRaw[];
  adaptMachineType?: string;
}

const isJunkName = (n?: string) =>
  !n || n.trim() === '' || n.trim() === '---' || /^\d{1,3}$/.test(n.trim());

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

function linkUri(links: LinkEntry[] | undefined, rel: string): string | null {
  if (!links) return null;
  return links.find((l) => l && l.rel === rel)?.uri || null;
}

// Run promises with bounded concurrency so we don't blow Deere's rate limit.
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

function projectDetail(
  detail: JdOperationDetail,
  fieldId: string,
  fieldName: string
): JdOperation {
  const products: JdOperationProduct[] = (detail.products || []).map((p) => ({
    name: p.name || '',
    type: p.productType || '',
    tankMix: p.tankMix,
  }));
  const varieties: string[] = (detail.varieties || [])
    .map((v) => v.name || '')
    .filter((n) => n && n !== '---');
  const tillageType = (detail.tillageProducts || [])
    .map((t) => t.tillageType)
    .filter((t): t is string => !!t)
    .join(', ');
  const machine = (detail.fieldOperationMachines || [])[0];
  return {
    id: detail.id,
    type: detail.fieldOperationType || 'unknown',
    fieldId,
    fieldName,
    startDate: detail.startDate || '',
    endDate: detail.endDate,
    cropSeason: detail.cropSeason,
    cropName: detail.cropName && detail.cropName !== 'NONE' ? detail.cropName : undefined,
    varieties: varieties.length ? varieties : undefined,
    products: products.length ? products : undefined,
    tillageType: tillageType || undefined,
    machineVin: machine?.vin,
    machineType: detail.adaptMachineType,
  };
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
  // Default: pull operations from January 2024 onwards. Caller can override
  // with ?since=2025-08-01 to pull only the current cropping year.
  const since = url.searchParams.get('since') || '2024-01-01';
  const sinceMs = new Date(since).getTime();
  if (Number.isNaN(sinceMs)) {
    return NextResponse.json({ error: 'Invalid ?since date' }, { status: 400 });
  }
  const fieldLimit = parseInt(url.searchParams.get('fieldLimit') || '0', 10);

  try {
    const { token, auth } = await getValidToken();
    if (!auth.orgs?.length) {
      return NextResponse.json({ error: 'No org connected.' }, { status: 400 });
    }
    const org = auth.orgs[0];

    // ── 1. Page through fields ────────────────────────────────────────────
    const allFields: JdField[] = [];
    let nextFieldsUrl: string | null =
      `${auth.apiBase}/organizations/${org.id}/fields?count=100`;
    let pages = 0;
    while (nextFieldsUrl && pages < 30) {
      const page: JdFieldsResponse = await jdFetch<JdFieldsResponse>(
        nextFieldsUrl,
        token,
        auth.apiBase
      );
      if (page.values) allFields.push(...page.values);
      nextFieldsUrl = linkUri(page.links, 'nextPage');
      pages++;
    }
    let realFields = allFields.filter((f) => !f.archived && !isJunkName(f.name));
    if (fieldLimit > 0) realFields = realFields.slice(0, fieldLimit);

    // ── 2. For each field, fetch operations list (parallel, bounded) ─────
    interface FieldOpsPair {
      field: JdField;
      ops: JdOperationListItem[];
      error?: string;
    }
    const fieldOpsPairs: FieldOpsPair[] = await pMap(realFields, 4, async (f) => {
      try {
        // Paginate through ALL operations for this field — JD may ignore count
        // or cap it internally. Follow nextPage links until exhausted.
        const allOps: JdOperationListItem[] = [];
        let nextOpsUrl: string | null =
          `${auth.apiBase}/organizations/${org.id}/fields/${f.id}/fieldOperations?count=200`;
        let opPages = 0;
        while (nextOpsUrl && opPages < 20) {
          const opsResp = await jdFetch<JdOperationsListResponse>(
            nextOpsUrl,
            token,
            auth.apiBase
          );
          if (opsResp.values) allOps.push(...opsResp.values);
          nextOpsUrl = linkUri(opsResp.links, 'nextPage');
          opPages++;
        }
        const recent = allOps.filter((o) => {
          if (!o.startDate) return true; // include ops with no date — filter later
          const t = new Date(o.startDate).getTime();
          return !Number.isNaN(t) && t >= sinceMs;
        });
        return { field: f, ops: recent };
      } catch (e) {
        return {
          field: f,
          ops: [],
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });

    // ── 3. Flatten and fetch detail for each (parallel, bounded) ─────────
    interface DetailJob {
      fieldId: string;
      fieldName: string;
      opId: string;
    }
    const jobs: DetailJob[] = [];
    for (const pair of fieldOpsPairs) {
      for (const op of pair.ops) {
        if (op.id) {
          jobs.push({
            fieldId: pair.field.id,
            fieldName: pair.field.name || '(unnamed)',
            opId: op.id,
          });
        }
      }
    }

    const detailErrors: string[] = [];
    const detailedOps: JdOperation[] = [];
    await pMap(jobs, 8, async (job) => {
      try {
        const detail = await jdFetch<JdOperationDetail>(
          `https://api.deere.com/platform/fieldOperations/${job.opId}`,
          token,
          auth.apiBase
        );
        detailedOps.push(projectDetail(detail, job.fieldId, job.fieldName));
      } catch (e) {
        detailErrors.push(
          `${job.fieldName} ${job.opId}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    });

    // Sort newest first.
    detailedOps.sort((a, b) => b.startDate.localeCompare(a.startDate));

    // ── 4. Persist to Supabase ───────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: existing } = await supabase
      .from('farmdata')
      .select('data')
      .eq('id', ROW_ID)
      .single();
    const current = (existing as { data?: Record<string, unknown> } | null)?.data ?? {};
    const merged = {
      ...current,
      jdOperations: detailedOps,
      jdSyncStatus: {
        syncedAt: new Date().toISOString(),
        fieldsTouched: fieldOpsPairs.filter((p) => p.ops.length > 0).length,
        operationsTotal: detailedOps.length,
        since,
      },
    };
    const { error: saveErr } = await supabase
      .from('farmdata')
      .upsert({ id: ROW_ID, data: merged, updated_at: new Date().toISOString() });
    if (saveErr) {
      return NextResponse.json(
        { error: 'Sync fetched but Supabase save failed', detail: saveErr.message },
        { status: 500 }
      );
    }

    // Per-field count summary, for the response.
    const perField: Record<string, number> = {};
    for (const op of detailedOps) {
      perField[op.fieldName] = (perField[op.fieldName] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      since,
      fieldsTotal: realFields.length,
      fieldsWithOps: fieldOpsPairs.filter((p) => p.ops.length > 0).length,
      operationsWritten: detailedOps.length,
      detailErrorCount: detailErrors.length,
      detailErrorsSample: detailErrors.slice(0, 10),
      perField,
      // Per-field op counts before detail fetch — helps diagnose if list vs detail is the gap
      perFieldListCount: Object.fromEntries(
        fieldOpsPairs.filter(p => p.ops.length > 0).map(p => [p.field.name || p.field.id, p.ops.length])
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
