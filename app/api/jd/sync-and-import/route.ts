import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildAssuranceImport } from '@/lib/jdAssurance';
import type { FarmData, Activity } from '@/lib/types';

// Combined nightly/weekly job: refreshes farmdata.jdOperations from John Deere
// (by calling the existing /api/jd/sync-write route on this same deployment),
// then runs the same field-matching + spray/fertiliser conversion the "Import
// to Hub" button on the JD Ops tab does, and writes the results straight into
// farmdata.sprays / farmdata.fertilisers. Existing records are never touched
// or removed — this only appends new ones (deduped by jdOpId) — so anything
// James edits by hand afterwards stays exactly as he left it.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_SECRET = process.env.API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ROW_ID = 'farmhub_main';

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function nowEnGb(): string {
  return new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
}

export async function POST(req: NextRequest) {
  if (API_SECRET) {
    const auth = req.headers.get('x-api-secret');
    if (auth !== API_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;

  // Step 1 — refresh jdOperations via the existing sync-write route.
  let syncResult: unknown = null;
  try {
    const syncRes = await fetch(`${origin}/api/jd/sync-write`, {
      method: 'POST',
      headers: API_SECRET ? { 'x-api-secret': API_SECRET } : {},
    });
    syncResult = await syncRes.json().catch(() => null);
    if (!syncRes.ok) {
      return NextResponse.json({ error: 'JD sync failed', detail: syncResult }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'JD sync request failed', detail: String(err) }, { status: 502 });
  }

  // Step 2 — read the now-fresh farmdata.
  const supabase = getClient();
  const { data: row, error: readErr } = await supabase.from('farmdata').select('data').eq('id', ROW_ID).single();
  if (readErr || !row) {
    return NextResponse.json({ error: 'Could not read farmdata after sync', detail: readErr?.message }, { status: 500 });
  }
  const current = row.data as FarmData;

  // Step 3 — build the import plan (same logic as the manual "Import to Hub" button).
  const plan = buildAssuranceImport({
    jdOps: current.jdOperations ?? [],
    hubFields: current.fields ?? [],
    existingSprays: current.sprays ?? [],
    existingFertilisers: current.fertilisers ?? [],
  });

  // Step 4 — append (never overwrite/remove existing, hand-edited or otherwise).
  const updatedSprays = [...(current.sprays ?? []), ...plan.newSprays];
  const updatedFertilisers = [...(current.fertilisers ?? []), ...plan.newFertilisers];

  const activityMsg = `JD auto-sync: ${plan.newSprays.length} spray(s), ${plan.newFertilisers.length} fertiliser(s) imported.` +
    (plan.unmatchedJdFields.length ? ` ${plan.unmatchedJdFields.length} JD field name(s) unmatched: ${plan.unmatchedJdFields.join(', ')}.` : '');
  const newActivity: Activity = { msg: activityMsg, time: nowEnGb() };
  const updatedActivity = [newActivity, ...(current.activity ?? [])].slice(0, 20);

  const { error: writeErr } = await supabase
    .from('farmdata')
    .upsert({
      id: ROW_ID,
      data: { ...current, sprays: updatedSprays, fertilisers: updatedFertilisers, activity: updatedActivity },
      updated_at: new Date().toISOString(),
    });
  if (writeErr) {
    return NextResponse.json({ error: 'Could not write import results', detail: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    sync: syncResult,
    imported: { newSprays: plan.newSprays.length, newFertilisers: plan.newFertilisers.length },
    skipped: plan.skipped,
    unmatchedJdFields: plan.unmatchedJdFields,
  });
}
