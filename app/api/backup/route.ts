import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Nightly copy of the Hub's data into farmdata_backups (Vercel cron, vercel.json).
// The copying and tidying happen in the database function nightly_farmdata_backup:
// it keeps the last 30 nightly copies plus the first of each month, and leaves
// hand-made backups alone. It's open like the weather save (Vercel's cron has no
// login), but a second call within 20 hours does nothing, so it can't be used to
// push good copies out. Logged in (or with API_SECRET) you can force one: ?force=1

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const force = !!req.headers.get('x-hub-auth') && req.nextUrl.searchParams.get('force') === '1';
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data, error } = await supabase.rpc('nightly_farmdata_backup', { force });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
