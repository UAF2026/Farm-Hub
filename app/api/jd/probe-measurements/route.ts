import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, jdFetch } from '@/lib/johnDeere';

// Diagnostic — picks one operation of each type from farmdata.jdOperations,
// follows its measurement link rels, and dumps the bodies so we can see the
// actual response shape. Used once to design the production extractor.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_SECRET = process.env.API_SECRET;

interface JdOpDetail {
  id: string;
  fieldOperationType?: string;
  links?: Array<{ rel?: string; uri?: string }>;
}

function checkAuth(req: NextRequest): NextResponse | null {
  if (!API_SECRET) return null;
  const url = new URL(req.url);
  const provided = req.headers.get('x-api-secret') || url.searchParams.get('secret');
  if (provided !== API_SECRET) {
    return NextResponse.json({ error: 'Unauthorised. Pass ?secret=…' }, { status: 401 });
  }
  return null;
}

// Measurement link rels we care about, per operation type.
const RELS_OF_INTEREST = [
  'applicationRateResult',
  'applicationRateTarget',
  'seedingRateResult',
  'seedingVarietiesResult',
  'harvestYieldResult',
  'harvestSpeedResult',
  'tillageDepthTarget',
];

export async function GET(req: NextRequest) {
  const denied = checkAuth(req);
  if (denied) return denied;

  try {
    const { token, auth } = await getValidToken();
    const url = new URL(req.url);
    const opId = url.searchParams.get('opId');

    let probeIds: string[];
    if (opId) {
      probeIds = [opId];
    } else {
      // Caller didn't specify — pick one op ID per type from the stored set.
      const supabaseUrl = process.env.SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
      const { createClient } = await import('@supabase/supabase-js');
      const supa = createClient(supabaseUrl, supabaseKey);
      const { data } = await supa
        .from('farmdata')
        .select('data')
        .eq('id', 'farmhub_main')
        .single();
      const ops =
        ((data as { data?: { jdOperations?: Array<{ id: string; type: string }> } } | null)
          ?.data?.jdOperations) || [];
      const seen = new Set<string>();
      probeIds = [];
      for (const op of ops) {
        if (!seen.has(op.type) && op.id) {
          seen.add(op.type);
          probeIds.push(op.id);
        }
        if (probeIds.length >= 4) break;
      }
    }

    const results: Array<Record<string, unknown>> = [];

    for (const id of probeIds) {
      const opDetail = await jdFetch<JdOpDetail>(
        `https://api.deere.com/platform/fieldOperations/${id}`,
        token,
        auth.apiBase
      );
      const interesting = (opDetail.links || []).filter(
        (l) => l.rel && RELS_OF_INTEREST.includes(l.rel)
      );
      const measurements: Record<string, unknown> = {};
      for (const link of interesting) {
        if (!link.uri || !link.rel) continue;
        try {
          const body = await jdFetch<unknown>(link.uri, token, auth.apiBase);
          measurements[link.rel] = body;
        } catch (e) {
          measurements[link.rel] = {
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      results.push({
        opId: id,
        type: opDetail.fieldOperationType,
        availableRels: (opDetail.links || []).map((l) => l.rel).filter(Boolean),
        measurements,
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
