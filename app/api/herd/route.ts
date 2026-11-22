import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// The Farmplan Cattle Manager history (every animal, calving, treatment,
// weight and sale), stored once in the Supabase table herd_records as the row
// id 'farmplan'. It is kept out of the main data blob because it is large
// (~1.2 MB) and never changes. James's corrections live in data.herdEdits.
//
// GET  → the stored import (or { empty: true })
// POST → { base } replaces the import. Only from a logged-in session.

export const dynamic = 'force-dynamic';

function getClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

export async function GET() {
  const { data, error } = await getClient().from('herd_records').select('data, updated_at').eq('id', 'farmplan').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ empty: true });
  return NextResponse.json({ base: data.data, updated_at: data.updated_at });
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-hub-auth') !== 'session') {
    return NextResponse.json({ error: 'Only from the Hub itself' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const base = body?.base;
  if (!base || !Array.isArray(base.animals) || !Array.isArray(base.calvings) || base.animals.length < 100) {
    return NextResponse.json({ error: 'That file does not look like a Farmplan herd export' }, { status: 400 });
  }
  const supabase = getClient();
  // Keep the previous import, if any, under a dated id before replacing it.
  const { data: old } = await supabase.from('herd_records').select('data').eq('id', 'farmplan').maybeSingle();
  if (old) {
    await supabase.from('herd_records').upsert({ id: `farmplan-before-${new Date().toISOString().slice(0, 10)}`, data: old.data, updated_at: new Date().toISOString() });
  }
  const { error } = await supabase.from('herd_records').upsert({ id: 'farmplan', data: base, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, animals: base.animals.length });
}
