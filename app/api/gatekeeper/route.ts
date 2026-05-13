import { NextRequest, NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ─── Types (mirrored from lib/types.ts — kept local to avoid import issues) ─ */
interface AgronomyProduct {
  name: string;
  mappNo?: string;
  activeIngredients?: string;
  ratePerHa: number;
  unit: string;
  totalRequired?: number;
  lerap?: string;
  expiryDate?: string;
}

interface AgronomyJobField {
  name: string;
  areaHa: number;
  crop: string;
  variety?: string;
  growthStage?: string;
  status: 'pending';
}

interface AgronomyJob {
  id: string;
  jobNumber: number;
  reason: string;
  comment?: string;
  totalAreaHa: number;
  fields: AgronomyJobField[];
  products: AgronomyProduct[];
  waterVolume?: number;
  earliestDate?: string;
  latestDate?: string;
  earliestGrowthStage?: string;
  latestGrowthStage?: string;
  sprayQuality?: string;
}

interface ParsedVisit {
  reportNo: string;
  issueDate: string;
  advisor: string;
  basisFacts?: string;
  jobs: AgronomyJob[];
  source: 'gatekeeper';
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function ddmmyyyyToIso(s: string): string {
  const p = s.split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  return s;
}

/* ─── Core parser ────────────────────────────────────────────────────────── */
function parseGatekeeperText(rawText: string, reportNoHint: string, issueDateHint: string): ParsedVisit {
  // Strip repeated page headers — every page repeats the same 5-line header block.
  // Pattern: "Recommendation Plan Advisor: Luke Cotton\n00012 Basis / Facts..."
  // We strip everything matching that block to get clean linear text.
  const cleaned = rawText
    .replace(/Recommendation Plan\s+Advisor:[^\n]+\n[^\n]+\n[^\n]*Mobile:[^\n]+\n[^\n]+Issued:[^\n]+\n[^\n]*Email:[^\n]+\n/g, '')
    // Strip the disclaimer boilerplate at the bottom of each page
    .replace(/Whilst every care is taken[\s\S]*?Cotton Farm Consultancy Ltd\.\n/g, '')
    .replace(/Printed:.*?Page:.*?\n/g, '')
    // Strip operator records section (blank table, not useful)
    .replace(/Operator Records Job \d+[\s\S]*?(?=Job \d+\s+Total job area|Total Plan Requirements|$)/g, '')
    // Strip Total Plan Requirements summary
    .replace(/Total Plan Requirements[\s\S]*$/g, '');

  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract metadata from raw text (before stripping)
  const advisorMatch = rawText.match(/Advisor:\s*(.+)/);
  const advisor = advisorMatch ? advisorMatch[1].trim() : 'Luke Cotton';

  const basisMatch = rawText.match(/Basis \/ Facts\s+(.+)/);
  const basisFacts = basisMatch ? basisMatch[1].trim() : undefined;

  // Detect report number and issue date from PDF text if not provided
  const issuedMatch = rawText.match(/Issued:\s*([\d/]+)/);
  const issueDate = issueDateHint || (issuedMatch ? ddmmyyyyToIso(issuedMatch[1]) : '');

  const reportMatch = rawText.match(/^(\d{5})\s+Basis/m);
  const reportNo = reportNoHint || (reportMatch ? reportMatch[1] : uid());

  // Find all job start positions
  const jobStarts: number[] = [];
  lines.forEach((l, i) => {
    if (/^Job \d+\s+Total job area/.test(l)) jobStarts.push(i);
  });

  const jobs: AgronomyJob[] = [];

  for (let ji = 0; ji < jobStarts.length; ji++) {
    const start = jobStarts[ji];
    const end = ji + 1 < jobStarts.length ? jobStarts[ji + 1] : lines.length;
    const block = lines.slice(start, end);

    // "Job 1  Total job area: 38.20 ha"
    const headerMatch = block[0].match(/^Job (\d+)\s+Total job area:\s*([\d.]+)\s*ha/);
    if (!headerMatch) continue;
    const jobNumber = parseInt(headerMatch[1]);
    const totalAreaHa = parseFloat(headerMatch[2]);

    // Reason / Comment — may be on one line or two
    let reason = '';
    let comment = '';
    for (const l of block.slice(1, 4)) {
      const m = l.match(/^Reason:(.*?)(?:\s+Comment:(.*))?$/);
      if (m) {
        reason = m[1].trim();
        comment = (m[2] || '').trim();
        break;
      }
    }

    // ── Fields ──────────────────────────────────────────────────────────
    const fieldsHeaderIdx = block.findIndex(l => /^Fields Job \d+/.test(l));
    const productsHeaderIdx = block.findIndex(l => /^Products Job \d+/.test(l));

    const fields: AgronomyJobField[] = [];
    if (fieldsHeaderIdx >= 0 && productsHeaderIdx > fieldsHeaderIdx) {
      // Line after header is column titles — skip it
      for (let i = fieldsHeaderIdx + 2; i < productsHeaderIdx; i++) {
        const l = block[i];
        // "Lodge big 15.00 Wheat Spring Wheat Spring 22, 2 Tillers"
        // "Black Dean & Pages 9.00 Wheat Winter Skyfall 39: Flag Leaf fully emerged, ligule visible"
        const fm = l.match(/^(.+?)\s+([\d.]+)\s+(Wheat|Barley|Oats?|Corn\s+Gromwell[^0-9]*|Rye|OSR|Oilseed)\s+(.+)$/i);
        if (fm) {
          const name = fm[1].trim();
          const areaHa = parseFloat(fm[2]);
          const crop = fm[3].trim();
          const rest = fm[4].trim();
          // Split variety from growth stage — GS starts with digits like "39:" or "22,"
          const gsMatch = rest.match(/^(.*?)\s+(\d+[:, ].+)$/);
          const variety = gsMatch ? gsMatch[1].trim() : undefined;
          const growthStage = gsMatch ? gsMatch[2].trim() : rest;
          if (name && areaHa > 0) {
            fields.push({ name, areaHa, crop, variety: variety || undefined, growthStage, status: 'pending' });
          }
        }
      }
    }

    // ── Products ─────────────────────────────────────────────────────────
    const products: AgronomyProduct[] = [];
    let waterVolume: number | undefined;
    let earliestDate: string | undefined;
    let latestDate: string | undefined;
    let earliestGS: string | undefined;
    let latestGS: string | undefined;
    let sprayQuality: string | undefined;

    if (productsHeaderIdx >= 0) {
      // Application rate + dates line immediately follows "Products Job N"
      // It may be split across two lines so join a few
      const appText = block.slice(productsHeaderIdx, productsHeaderIdx + 4).join(' ');

      const wvM = appText.match(/Application rate:\s*([\d.]+)\s*L/);
      if (wvM) waterVolume = parseFloat(wvM[1]);

      const edM = appText.match(/Earliest application:\s*([\d/]+)/);
      if (edM) earliestDate = ddmmyyyyToIso(edM[1]);

      const ldM = appText.match(/Latest application:\s*([\d/]+)/);
      if (ldM) latestDate = ddmmyyyyToIso(ldM[1]);

      const egM = appText.match(/Earliest growth stage:\s*([^,L]+)/);
      if (egM) earliestGS = egM[1].trim();

      const lgM = appText.match(/Latest growth stage:\s*([^,S]+)/);
      if (lgM) latestGS = lgM[1].trim();

      const sqM = appText.match(/Spray quality:\s*(\w+)/);
      if (sqM) sprayQuality = sqM[1];

      // Product lines — skip the "Rate / ha Required Units % Rate LERAP Total Used" header
      const rateHeaderIdx = block.findIndex((l, i) => i > productsHeaderIdx && /^Rate\s*\/\s*ha/.test(l));
      const prodStart = rateHeaderIdx >= 0 ? rateHeaderIdx + 1 : productsHeaderIdx + 3;

      for (let i = prodStart; i < block.length; i++) {
        const l = block[i];
        // Product line: "Jessico One (20475) 1.000 58.080 L 50 *"
        // or "Boudha (19537) 15.000 573.000 g 75"
        const pm = l.match(/^(.+?)\s*\((\d{4,6})\)\s+([\d.]+)\s+([\d.]+)\s+([A-Za-z]+)\s+(.+?)(?:\s+([*B]))?$/);
        if (pm) {
          products.push({
            name: pm[1].trim(),
            mappNo: pm[2],
            ratePerHa: parseFloat(pm[3]),
            totalRequired: parseFloat(pm[4]),
            unit: pm[5],
            lerap: pm[7] || undefined,
          });
          continue;
        }
        // MAPP detail line: "MAPP:20475, Active Ingredients: Fenpicoxamid 5.00%, Expires:11/04/2031"
        const mappM = l.match(/^MAPP:(\d+),\s*Active Ingredients:\s*([^,E]+(?:,\s*[^,E]+%)*)/);
        if (mappM && products.length > 0) {
          const last = products[products.length - 1];
          if (last.mappNo === mappM[1]) {
            last.activeIngredients = mappM[2].trim().replace(/,\s*$/, '');
          }
          const expM = l.match(/Expires:([\d/]+)/);
          if (expM) last.expiryDate = ddmmyyyyToIso(expM[1]);
        }
      }
    }

    jobs.push({
      id: uid(),
      jobNumber,
      reason,
      comment: comment || undefined,
      totalAreaHa,
      fields,
      products,
      waterVolume,
      earliestDate,
      latestDate,
      earliestGrowthStage: earliestGS,
      latestGrowthStage: latestGS,
      sprayQuality,
    });
  }

  return { reportNo, issueDate, advisor, basisFacts, jobs, source: 'gatekeeper' };
}

/* ─── Route handler ──────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    const reportNoHint = (formData.get('reportNo') as string) || '';
    const issueDateHint = (formData.get('issueDate') as string) || '';

    if (!file) return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text: string = parsed.text;

    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 422 });
    }

    const visit = parseGatekeeperText(text, reportNoHint, issueDateHint);

    if (visit.jobs.length === 0) {
      return NextResponse.json({ error: 'No jobs found in PDF — is this a Gatekeeper recommendation report?', rawText: text.slice(0, 500) }, { status: 422 });
    }

    return NextResponse.json({ visit });
  } catch (err) {
    console.error('Gatekeeper parse error:', err);
    return NextResponse.json({ error: 'Parse failed: ' + String(err) }, { status: 500 });
  }
}
