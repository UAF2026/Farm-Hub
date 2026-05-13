import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ─── Types ──────────────────────────────────────────────────────────────── */
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

/* ─── Parser ─────────────────────────────────────────────────────────────── */
function parseGatekeeper(rawText: string, reportNoHint: string, issueDateHint: string): ParsedVisit {
  // pdf-parse produces column-scrambled output from this Gatekeeper PDF format.
  // The structure per page is:
  //
  //   "Fields"
  //   "Area haGrowth StageCropVariety"   ← column header (skip)
  //   "Job N"
  //   "Reason:... Comment:..."
  //   "haNNN.NNTotal job area:"
  //   "Job N"                             ← repeated (skip)
  //   <field rows, each 4 lines:>
  //     "NNN.NN"                          ← area
  //     "Crop VariantVariety"             ← crop+variety joined
  //     "GS: description"                 ← growth stage
  //     "Field name"                      ← field name
  //   "ProductsJob NApplication rate:NNN L"
  //   "date/GS range line"
  //   "Total UsedRequired..."             ← header (skip)
  //   <product rows:>
  //     "ProductName (MAPP) rate total unit % lerap"
  //     "MAPP:NNNN, Active Ingredients:... Expires:DD/MM/YYYY"
  //   "Operator RecordsArea"             ← end of job data
  //
  // Pages interleave with header/footer/disclaimer blocks — strip those first.

  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    // Strip page header noise
    .filter(l => !l.startsWith('Recommendation Plan'))
    .filter(l => !l.startsWith('Issued:'))
    .filter(l => !l.startsWith('Advisor:'))
    .filter(l => !l.startsWith('Basis / Facts'))
    .filter(l => !l.startsWith('Mobile:'))
    .filter(l => !l.startsWith('Email:'))
    .filter(l => !l.startsWith('M J Hunt & Son'))
    .filter(l => !l.startsWith('Gatekeeper'))
    .filter(l => !l.startsWith('Printed:'))
    .filter(l => !l.startsWith('Whilst every care'))
    .filter(l => !l.startsWith('cleaning procedures'))
    .filter(l => !l.startsWith('for off label'))
    .filter(l => !l.startsWith('restrictions placed'))
    .filter(l => !l.startsWith('Consultancy Ltd'))
    .filter(l => !l.startsWith('target area'))
    // Skip operator records section headers
    .filter(l => !l.startsWith('Operator RecordsArea'))
    .filter(l => !l.startsWith('DateDirectionStartFinish'))
    .filter(l => l !== 'Wind')
    .filter(l => !l.startsWith('WeatherTemp'))
    .filter(l => l !== 'Buffer')
    .filter(l => l !== 'Zone (m)')
    // Skip table column headers
    .filter(l => l !== 'Fields')
    .filter(l => !l.startsWith('Area haGrowth Stage'))
    .filter(l => !l.startsWith('Total UsedRequired'));

  // Extract metadata from raw text
  const issuedMatch = rawText.match(/Issued:\s*([\d/]+)/);
  const issueDate = issueDateHint || (issuedMatch ? ddmmyyyyToIso(issuedMatch[1]) : '');

  const reportMatch = rawText.match(/^(\d{5})\s*$/m);
  const reportNo = reportNoHint || (reportMatch ? reportMatch[1] : uid());

  const advisorMatch = rawText.match(/Advisor:\s*\n?\s*(.+)/);
  const advisor = advisorMatch ? advisorMatch[1].trim() : 'Luke Cotton';

  const basisMatch = rawText.match(/Basis \/ Facts\s*\n\s*(.+)/);
  const basisFacts = basisMatch ? basisMatch[1].trim() : undefined;

  // ── Find job blocks ───────────────────────────────────────────────────
  // Job starts: "Job N" line that is NOT immediately followed by another "Job N"
  // (the duplicate "Job N" after the "haNN.NNTotal job area:" line is a repeat we skip)
  const jobIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^Job \d+$/.test(lines[i])) {
      // Check it's followed by a Reason line (real job start), not "haNN" (duplicate)
      const next = lines[i + 1] || '';
      if (next.startsWith('Reason:')) {
        jobIndices.push(i);
      }
    }
  }

  const jobs: AgronomyJob[] = [];

  for (let ji = 0; ji < jobIndices.length; ji++) {
    const start = jobIndices[ji];
    const end = ji + 1 < jobIndices.length ? jobIndices[ji + 1] : lines.length;
    const block = lines.slice(start, end);

    const jobNumber = parseInt(block[0].replace('Job ', ''));

    // "Reason:T2 fungicide  Comment:Apply within 14 days/..."
    // Comment may overflow to next line
    let reason = '';
    let comment = '';
    const reasonLine = block[1] || '';
    const reasonM = reasonLine.match(/^Reason:(.*?)(?:\s{2,}Comment:(.*))?$/);
    if (reasonM) {
      reason = reasonM[1].trim();
      comment = (reasonM[2] || '').trim();
      // Comment overflow on next line?
      if (!comment && block[2] && !block[2].startsWith('ha') && !block[2].startsWith('Job')) {
        comment = block[2].trim();
      }
    }

    // "ha38.20Total job area:" — extract the number
    const areaLine = block.find(l => l.includes('Total job area:'));
    const totalAreaHa = areaLine ? parseFloat((areaLine.match(/([\d.]+)/) || [])[1] || '0') : 0;

    // ── Find fields ───────────────────────────────────────────────────
    // After the second "Job N" duplicate line, fields come in groups of 4:
    //   area | crop+variety | growthStage | fieldName
    // Until we hit "ProductsJob N..."
    const dupJobIdx = block.findIndex((l, i) => i > 1 && /^Job \d+$/.test(l));
    const productsIdx = block.findIndex(l => /^ProductsJob \d+/.test(l));
    const fieldStart = dupJobIdx >= 0 ? dupJobIdx + 1 : 3;
    const fieldEnd = productsIdx >= 0 ? productsIdx : block.length;

    const fields: AgronomyJobField[] = [];
    // Pre-process field block: some crop names split across 2 lines (e.g. "Corn Gromwell-" / "Winter")
    // Merge those so every field is consistently 4 lines: area | cropVariety | growthStage | fieldName
    const rawFieldBlock = block.slice(fieldStart, fieldEnd);
    const fieldBlock: string[] = [];
    for (let ri = 0; ri < rawFieldBlock.length; ri++) {
      const l = rawFieldBlock[ri];
      const next = rawFieldBlock[ri + 1] || '';
      // If this looks like an incomplete crop name (ends with - or is a bare season word)
      // AND the next line continues the same pattern, merge them
      if (/^(Corn\s+Gromwell-|Oilseed)$/i.test(l) && /^(Winter|Spring|Summer)$/i.test(next)) {
        fieldBlock.push(l + ' ' + next);
        ri++; // skip next line — consumed
      } else {
        fieldBlock.push(l);
      }
    }

    // Each field = 4 consecutive lines: area, cropVariety, growthStage, name
    // cropVariety may be "Wheat WinterSkyfall" (variety appended), "Wheat Winter" (no variety),
    // or "Corn Gromwell- Winter" (no variety). The crop+variety columns are concatenated.
    let fi = 0;
    while (fi + 3 < fieldBlock.length) {
      const areaStr = fieldBlock[fi];
      let cropVar = fieldBlock[fi + 1];
      let gs = fieldBlock[fi + 2];
      let name = fieldBlock[fi + 3];

      // Validate: areaStr should be a number, cropVar should contain crop type
      if (/^[\d.]+$/.test(areaStr) && /^(Wheat|Barley|Oat|Corn|Rye|OSR|Oilseed)/i.test(cropVar)) {
        const areaHa = parseFloat(areaStr);

        // "Wheat WinterSkyfall" → crop="Wheat Winter", variety="Skyfall"
        // "Wheat SpringWheat Spring" → crop="Wheat Spring", variety repeated → discard
        // "Corn Gromwell- Winter" → crop="Corn Gromwell- Winter", no variety
        const cropVarM = cropVar.match(/^(Wheat\s+(?:Winter|Spring)|Barley\s+(?:Winter|Spring)|Winter\s+Barley|Spring\s+Barley|Oats?\s+(?:Winter|Spring)|Corn\s+Gromwell-?\s*\w*)(.*)$/i);
        let crop = cropVar;
        let variety: string | undefined;
        if (cropVarM) {
          crop = cropVarM[1].trim();
          const v = cropVarM[2].trim();
          // Discard if variety is just the crop name repeated
          variety = v && !v.toLowerCase().startsWith(crop.toLowerCase().slice(0, 8)) ? v : undefined;
        }

        // Detect duplicate variety column: Gatekeeper sometimes outputs the crop+variety string
        // twice (once for the crop col, once for the variety col) before the growth stage.
        // When fi+2 is identical to cropVar, or matches the same crop-type pattern, it's a
        // duplicate — skip it and read gs from fi+3, name from fi+4.
        const isDuplicateVarietyLine =
          gs === cropVar ||
          (/^(Wheat|Barley|Oat|Corn\s+Gromwell|Rye|OSR|Oilseed)/i.test(gs) && gs !== name);

        let advance = 4;
        if (isDuplicateVarietyLine) {
          gs   = fieldBlock[fi + 3] || '';
          name = fieldBlock[fi + 4] || '';
          advance = 5;
        }

        // If gs doesn't look like a growth stage and name looks like one, they may be swapped
        // (shouldn't happen but defensive)
        if (!/^\d/.test(gs) && /^\d/.test(name)) {
          [gs, name] = [name, gs];
        }

        fields.push({ name, areaHa, crop, variety, growthStage: gs || undefined, status: 'pending' });
        fi += advance;
      } else {
        fi++; // skip unexpected line
      }
    }

    // ── Products ──────────────────────────────────────────────────────
    const products: AgronomyProduct[] = [];
    let waterVolume: number | undefined;
    let earliestDate: string | undefined;
    let latestDate: string | undefined;
    let earliestGS: string | undefined;
    let latestGS: string | undefined;
    let sprayQuality: string | undefined;

    if (productsIdx >= 0) {
      // "ProductsJob NApplication rate:200 L"
      const prodHeader = block[productsIdx];
      const wvM = prodHeader.match(/Application rate:\s*([\d.]+)\s*L/);
      if (wvM) waterVolume = parseFloat(wvM[1]);

      // Next line: date/GS constraints
      const constraintLine = block[productsIdx + 1] || '';
      const edM = constraintLine.match(/Earliest application:\s*([\d/]+)/);
      if (edM) earliestDate = ddmmyyyyToIso(edM[1]);
      const ldM = constraintLine.match(/Latest application:\s*([\d/]+)/);
      if (ldM) latestDate = ddmmyyyyToIso(ldM[1]);
      const egM = constraintLine.match(/Earliest growth stage:\s*([^,]+)/);
      if (egM) earliestGS = egM[1].trim();
      const lgM = constraintLine.match(/Latest growth stage:\s*(.+?)(?:,\s*Spray|$)/);
      if (lgM) latestGS = lgM[1].trim();
      const sqM = constraintLine.match(/Spray quality:\s*(\w+)/);
      if (sqM) sprayQuality = sqM[1];

      // Product lines start after "Total UsedRequired..." header (already filtered) = productsIdx + 2
      for (let pi = productsIdx + 2; pi < block.length; pi++) {
        const l = block[pi];
        // "Jessico One (20475)1.00058.080L50*"  or  "Boudha (19537)15.000573.000g75"
        const pm = l.match(/^(.+?)\s*\((\d{4,6})\)([\d.]+)([\d.]+)([A-Za-z]+)(\S+?)([*B])?$/);
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
        // "MAPP:20475, Active Ingredients: Fenpicoxamid 5.00%,  Expires:11/04/2031"
        const mappM = l.match(/^MAPP:(\d+),\s*Active Ingredients:\s*(.+?)(?:\s{2,}Expires:([\d/]+))?(?:\s{2,}Environmental|$)/);
        if (mappM && products.length > 0) {
          const last = products[products.length - 1];
          if (last.mappNo === mappM[1]) {
            last.activeIngredients = mappM[2].trim().replace(/,\s*$/, '');
            if (mappM[3]) last.expiryDate = ddmmyyyyToIso(mappM[3]);
          }
        }
        // Also catch Expires on same or following line
        const expM = l.match(/Expires:([\d/]+)/);
        if (expM && products.length > 0 && !products[products.length - 1].expiryDate) {
          products[products.length - 1].expiryDate = ddmmyyyyToIso(expM[1]);
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

/* ─── Route ──────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    const reportNoHint = (formData.get('reportNo') as string) || '';
    const issueDateHint = (formData.get('issueDate') as string) || '';

    if (!file) return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    // Import the internal lib directly to avoid pdf-parse's self-test which tries to
    // open './test/data/05-versions-space.pdf' and crashes in serverless environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseLib = require('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParseLib(buffer);
    const text: string = parsed.text;

    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 422 });
    }

    const visit = parseGatekeeper(text, reportNoHint, issueDateHint);

    if (visit.jobs.length === 0) {
      return NextResponse.json({
        error: 'No jobs found — is this a Gatekeeper recommendation report?',
        sample: text.slice(0, 300),
      }, { status: 422 });
    }

    return NextResponse.json({ visit });
  } catch (err) {
    console.error('Gatekeeper parse error:', err);
    return NextResponse.json({ error: 'Parse failed: ' + String(err) }, { status: 500 });
  }
}
