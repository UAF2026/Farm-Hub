import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const API_SECRET = process.env.API_SECRET;
const ROW_ID = 'farmhub_main';

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// GET — read current farm data
export async function GET(req: NextRequest) {
  if (API_SECRET) {
    const auth = req.headers.get('x-api-secret');
    if (auth !== API_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const supabase = getClient();
  const { data, error } = await supabase.from('farmdata').select('data').eq('id', ROW_ID).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.data ?? {});
}

// POST — merge new data into farm data (used by Cowork)
export async function POST(req: NextRequest) {
  if (API_SECRET) {
    const auth = req.headers.get('x-api-secret');
    if (auth !== API_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const supabase = getClient();

  // Fetch existing
  const { data: existing } = await supabase.from('farmdata').select('data').eq('id', ROW_ID).single();
  const current = existing?.data ?? {};

  // Merge with incoming
  const body = await req.json();
  const merged = { ...current, ...body };

  const { error } = await supabase
    .from('farmdata')
    .upsert({ id: ROW_ID, data: merged, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// PATCH — append a single record to a named array (e.g. tasks, finance)
export async function PATCH(req: NextRequest) {
  if (API_SECRET) {
    const auth = req.headers.get('x-api-secret');
    if (auth !== API_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const supabase = getClient();
  const body = await req.json();
  const { collection, record } = body;

  if (!collection || !record) {
    return NextResponse.json({ error: 'collection and record are required' }, { status: 400 });
  }

  // Fetch existing
  const { data: existing } = await supabase.from('farmdata').select('data').eq('id', ROW_ID).single();
  const current = existing?.data ?? {};
  const arr = Array.isArray(current[collection]) ? current[collection] : [];
  arr.push(record);
  current[collection] = arr;

  const { error } = await supabase
    .from('farmdata')
    .upsert({ id: ROW_ID, data: current, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, total: arr.length });
}
