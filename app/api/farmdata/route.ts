import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// The browser's only way to load and save the farm data blob (farmdata row
// 'farmhub_main'). Behind the login (middleware.ts); uses the service key, so
// the public anon key needs no access to farm data.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ROW_ID = 'farmhub_main';
const client = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// Written by server routes or scheduled tasks; a browser's copy can be hours
// stale, so it never overwrites these.
const SERVER_KEYS = ['jdAuth', 'jdOperations', 'jdSyncStatus'] as const;

export async function GET() {
  const { data, error } = await client().from('farmdata').select('data').eq('id', ROW_ID).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const blob = { ...(data?.data ?? {}) } as Record<string, unknown>;
  delete blob.jdAuth;   // John Deere tokens stay on the server
  return NextResponse.json(blob);
}

export async function POST(req: NextRequest) {
  const local = (await req.json()) as Record<string, unknown> & { dailyBriefing?: { date?: string } };
  const supabase = client();
  const { data: existing, error: readErr } = await supabase.from('farmdata').select('data').eq('id', ROW_ID).single();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  const server = (existing?.data ?? {}) as Record<string, unknown> & { dailyBriefing?: { date?: string } };

  // Local copy wins for everything it sends…
  const toSave: Record<string, unknown> = { ...server, ...local };
  // …except server-managed keys…
  for (const k of SERVER_KEYS) {
    if (server[k] !== undefined) toSave[k] = server[k];
    else delete toSave[k];
  }
  // …and a newer daily briefing written by the morning task.
  const localDate = local.dailyBriefing?.date;
  const serverDate = server.dailyBriefing?.date;
  if (serverDate && (!localDate || serverDate > localDate)) toSave.dailyBriefing = server.dailyBriefing;

  const { error } = await supabase.from('farmdata').upsert({ id: ROW_ID, data: toSave, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
