import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, jdFetch } from '@/lib/johnDeere';

// Diagnostic sync — fetches a summary of what's available from John Deere
// for each connected org. Does NOT yet write into farmdata.cropping; the
// purpose of this first pass is to inspect the actual data shape Deere
// returns so we can build the mapping precisely.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_SECRET = process.env.API_SECRET;

interface JdField {
  id: string;
  name?: string;
  archived?: boolean;
  area?: { measurement?: number; unit?: string };
  clientName?: string;
  farmName?: string;
}

interface JdFieldsResponse {
  total?: number;
  values?: JdField[];
}

interface JdFieldOperation {
  id: string;
  fieldOperationType?: string;
  startDate?: string;
  endDate?: string;
  cropYear?: number;
  field?: { id?: string; name?: string };
  crop?: { name?: string };
  variety?: { name?: string };
  totalArea?: { measurement?: number; unit?: string };
  totalYield?: { measurement?: number; unit?: string };
  averageYield?: { measurement?: number; unit?: string };
}

interface JdFieldOperationsResponse {
  total?: number;
  values?: JdFieldOperation[];
}

function checkAuth(req: NextRequest): NextResponse | null {
  if (!API_SECRET) return null; // No secret configured — endpoint is open.
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

export async function GET(req: NextRequest) {
  const denied = checkAuth(req);
  if (denied) return denied;

  try {
    const { token, auth } = await getValidToken();

    if (!auth.orgs || auth.orgs.length === 0) {
      return NextResponse.json(
        { error: 'No organisations on the stored connection.' },
        { status: 400 }
      );
    }

    const orgsOut: Array<Record<string, unknown>> = [];

    for (const org of auth.orgs) {
      const orgOut: Record<string, unknown> = {
        id: org.id,
        name: org.name,
        type: org.type,
      };

      // -------- Fields --------
      try {
        const fields = await jdFetch<JdFieldsResponse>(
          `/organizations/${org.id}/fields?count=200`,
          token,
          auth.apiBase
        );
        const list = fields.values || [];
        orgOut.fieldsTotal = fields.total ?? list.length;
        orgOut.fieldsSample = list.slice(0, 10).map((f) => ({
          id: f.id,
          name: f.name,
          archived: f.archived,
          area: f.area,
          clientName: f.clientName,
          farmName: f.farmName,
        }));
        // Pull all field names so we can eyeball matches against Hub fields.
        orgOut.fieldNames = list.map((f) => f.name).filter(Boolean);
      } catch (e) {
        orgOut.fieldsError = e instanceof Error ? e.message : String(e);
      }

      // -------- Field Operations --------
      try {
        const ops = await jdFetch<JdFieldOperationsResponse>(
          `/organizations/${org.id}/fieldOperations?count=200`,
          token,
          auth.apiBase
        );
        const list = ops.values || [];
        const byType: Record<string, number> = {};
        const byCropYear: Record<string, number> = {};
        for (const op of list) {
          const t = op.fieldOperationType || 'unknown';
          byType[t] = (byType[t] || 0) + 1;
          const y = op.cropYear ? String(op.cropYear) : 'no-year';
          byCropYear[y] = (byCropYear[y] || 0) + 1;
        }
        orgOut.fieldOperationsTotal = ops.total ?? list.length;
        orgOut.fieldOperationsByType = byType;
        orgOut.fieldOperationsByCropYear = byCropYear;
        orgOut.fieldOperationsSample = list.slice(0, 10).map((o) => ({
          id: o.id,
          type: o.fieldOperationType,
          startDate: o.startDate,
          endDate: o.endDate,
          cropYear: o.cropYear,
          fieldId: o.field?.id,
          fieldName: o.field?.name,
          crop: o.crop?.name,
          variety: o.variety?.name,
          totalArea: o.totalArea,
          totalYield: o.totalYield,
          averageYield: o.averageYield,
        }));
      } catch (e) {
        orgOut.fieldOperationsError = e instanceof Error ? e.message : String(e);
      }

      orgsOut.push(orgOut);
    }

    return NextResponse.json(
      {
        ok: true,
        runAt: new Date().toISOString(),
        tokenExpiresAt: auth.expiresAt,
        scope: auth.scope,
        apiBase: auth.apiBase,
        orgs: orgsOut,
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
