import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, jdFetch } from '@/lib/johnDeere';

// Diagnostic sync — fetches a summary of what's available from John Deere
// for each connected org. Does NOT yet write into farmdata.cropping; the
// purpose of this first pass is to inspect the actual data shape Deere
// returns so we can build the mapping precisely.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_SECRET = process.env.API_SECRET;

interface LinkEntry {
  '@type'?: string;
  rel?: string;
  uri?: string;
}

function linkUri(links: unknown, rel: string): string | null {
  if (!Array.isArray(links)) return null;
  const found = (links as LinkEntry[]).find((l) => l && l.rel === rel);
  return found?.uri || null;
}

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
  links?: LinkEntry[];
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

    // Refresh the organisations record from Deere so we can see the live
    // 'links' array — that's where Deere advertises which data types are
    // currently accessible to this app.
    let orgsLive: Array<Record<string, unknown>> = [];
    try {
      const orgsResp = await jdFetch<{ values?: Array<Record<string, unknown>> }>(
        `/organizations`,
        token,
        auth.apiBase
      );
      orgsLive = orgsResp.values || [];
    } catch (e) {
      orgsLive = [
        { error: e instanceof Error ? e.message : String(e) },
      ];
    }

    const orgsOut: Array<Record<string, unknown>> = [];

    for (const org of auth.orgs) {
      const live = orgsLive.find((o) => (o as { id?: string }).id === org.id) as
        | Record<string, unknown>
        | undefined;
      const liveLinks = live?.links;
      const orgOut: Record<string, unknown> = {
        id: org.id,
        name: org.name,
        type: org.type,
        // Use the URLs Deere tells us about, not URLs we construct.
        // Different hosts (api.deere.com vs partnerapi.deere.com) gate
        // different endpoints, so following the link rels is more reliable.
        fieldsLink: linkUri(liveLinks, 'fields'),
        fieldOperationsLink: linkUri(liveLinks, 'fieldOperation'),
        manageConnectionLink: linkUri(liveLinks, 'manage_connection'),
      };

      // -------- Fields --------
      // Prefer the link rel URL; fall back to the constructed URL if missing.
      const fieldsUrl =
        (linkUri(liveLinks, 'fields') as string | null) ||
        `${auth.apiBase}/organizations/${org.id}/fields`;
      try {
        const fields = await jdFetch<JdFieldsResponse>(
          `${fieldsUrl}${fieldsUrl.includes('?') ? '&' : '?'}count=200`,
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

      // -------- Field Operations (per Mubin @ Deere support: per-field, not org-wide) --------
      // /organizations/{orgId}/fieldOperations does NOT exist as a usable endpoint.
      // The correct endpoint is /organizations/{orgId}/fields/{fieldId}/fieldOperations
      // We iterate fields with sensible names, skipping the auto-generated "---" / "1" placeholders.
      const isJunkName = (n?: string) =>
        !n ||
        n.trim() === '' ||
        n.trim() === '---' ||
        /^\d{1,3}$/.test(n.trim()); // bare 1-3 digit names are auto-generated placeholders

      try {
        // Deere's /fields endpoint defaults to 10 items/page and ignores count > its hidden max.
        // Follow `nextPage` links until exhausted (with a safety cap) to get all 116 fields.
        const allValues: JdField[] = [];
        let nextUrl: string | null =
          `${fieldsUrl}${fieldsUrl.includes('?') ? '&' : '?'}count=100`;
        let pages = 0;
        while (nextUrl && pages < 30) {
          const page: JdFieldsResponse = await jdFetch<JdFieldsResponse>(
            nextUrl,
            token,
            auth.apiBase
          );
          if (page.values) allValues.push(...page.values);
          const next = (page.links || []).find((l) => l && l.rel === 'nextPage');
          nextUrl = next?.uri || null;
          pages++;
        }
        const realFields = allValues.filter((f) => !f.archived && !isJunkName(f.name));
        orgOut.fieldsPaginatedTotal = allValues.length;
        orgOut.fieldsPagesFetched = pages;
        orgOut.realFieldNames = realFields.map((f) => f.name).filter(Boolean);

        // To keep this diagnostic fast, sample the first 10 real fields.
        // The full sync will cover all of them.
        const fieldsToProbe = realFields.slice(0, 10);

        const opsByField: Array<Record<string, unknown>> = [];
        const byType: Record<string, number> = {};
        const byCropYear: Record<string, number> = {};
        let totalOps = 0;
        let firstErr: string | null = null;

        // Track one operation ID we can fetch in detail afterwards.
        let probeOperationId: string | null = null;

        for (const f of fieldsToProbe) {
          try {
            const ops = await jdFetch<JdFieldOperationsResponse>(
              `${auth.apiBase}/organizations/${org.id}/fields/${f.id}/fieldOperations?count=200`,
              token,
              auth.apiBase
            );
            const list = ops.values || [];
            totalOps += list.length;
            for (const op of list) {
              const t = op.fieldOperationType || 'unknown';
              byType[t] = (byType[t] || 0) + 1;
              const y = op.cropYear ? String(op.cropYear) : 'no-year';
              byCropYear[y] = (byCropYear[y] || 0) + 1;
              if (!probeOperationId && op.id) probeOperationId = op.id;
            }
            opsByField.push({
              fieldId: f.id,
              fieldName: f.name,
              opsCount: list.length,
              firstThree: list.slice(0, 3).map((o) => ({
                id: o.id,
                type: o.fieldOperationType,
                startDate: o.startDate,
                endDate: o.endDate,
                cropYear: o.cropYear,
                crop: o.crop?.name,
                variety: o.variety?.name,
                totalArea: o.totalArea,
                totalYield: o.totalYield,
              })),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!firstErr) firstErr = msg;
            opsByField.push({ fieldId: f.id, fieldName: f.name, error: msg });
          }
        }

        // Dig into ONE operation in full detail to see what's actually available
        // beyond the list-level summary (crop/variety/yield/products/etc.).
        if (probeOperationId) {
          // Try both common API hosts, since list calls succeed against api.deere.com
          // but per-resource calls sometimes use a different base.
          const detailUrls = [
            `https://api.deere.com/platform/fieldOperations/${probeOperationId}`,
            `${auth.apiBase}/fieldOperations/${probeOperationId}`,
          ];
          const detailResults: Array<Record<string, unknown>> = [];
          for (const url of detailUrls) {
            try {
              const detail = await jdFetch<unknown>(url, token, auth.apiBase);
              detailResults.push({ url, body: detail });
              break; // succeed on first working URL
            } catch (e) {
              detailResults.push({
                url,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
          orgOut.singleOperationDetail = detailResults;
          orgOut.probeOperationId = probeOperationId;
        }

        orgOut.fieldsRealCount = realFields.length;
        orgOut.fieldsJunkCount = allValues.length - realFields.length;
        orgOut.fieldsProbed = fieldsToProbe.length;
        orgOut.fieldOperationsTotalSampled = totalOps;
        orgOut.fieldOperationsByType = byType;
        orgOut.fieldOperationsByCropYear = byCropYear;
        orgOut.fieldOperationsByField = opsByField;
        if (firstErr) orgOut.fieldOperationsFirstError = firstErr;
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
