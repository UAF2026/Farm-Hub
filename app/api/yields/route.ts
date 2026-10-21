import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { FieldYield } from '@/lib/types';

// Yields per field per harvest year, in the Supabase field_yields table.
// field_id points at data.fieldRegister[].id. One row per field + harvest
// year + crop (enforced by the field_yields_field_year_crop constraint).

export const dynamic = 'force-dynamic';

function getClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

const num = (v: unknown) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

// GET — all yields (optionally ?field_id=), newest harvest first
export async function GET(req: NextRequest) {
  let q = getClient().from('field_yields').select('*').order('harvest_year', { ascending: false }).order('field_name');
  const fieldId = req.nextUrl.searchParams.get('field_id');
  if (fieldId) q = q.eq('field_id', fieldId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — add or update one yield (matched on field + harvest year + crop)
export async function POST(req: NextRequest) {
  const b = (await req.json()) as FieldYield;
  if (!b.field_id || !b.field_name || !/^\d{4}$/.test(String(b.harvest_year))) {
    return NextResponse.json({ error: 'field_id, field_name and a 4-digit harvest_year are required' }, { status: 400 });
  }
  const row = {
    field_id: b.field_id,
    field_name: b.field_name,
    rpa_parcel: b.rpa_parcel || null,
    harvest_year: String(b.harvest_year),
    crop: (b.crop || '').trim(),
    variety: b.variety?.trim() || null,
    yield_t_per_ha: num(b.yield_t_per_ha),
    total_tonnes: num(b.total_tonnes),
    area_ha: num(b.area_ha),
    moisture_pct: num(b.moisture_pct),
    protein_pct: num(b.protein_pct),
    source: b.source || 'entered in Hub',
    notes: b.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = getClient();
  const { data, error } = b.id
    ? await supabase.from('field_yields').update(row).eq('id', b.id).select().single()
    : await supabase.from('field_yields').upsert(row, { onConflict: 'field_id,harvest_year,crop' }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — ?id=<uuid>
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await getClient().from('field_yields').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
