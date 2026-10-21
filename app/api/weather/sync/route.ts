import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchArchive, fetchRecent, todayLondon, addDays, HISTORY_START, WeatherDay } from '@/lib/weather';

// Saves daily farm weather into the weather_daily table.
//
// Vercel cron calls GET every morning (vercel.json) with no params: re-fetches
// the last 14 days so forecast-model rows get replaced by observed archive
// data once it's available.
//
// Backfill: ?from=YYYY-MM-DD&to=YYYY-MM-DD (e.g. ?from=2000-01-01).
//
// No password: it only ever writes public weather data for the farm's own
// location, and re-running it just overwrites the same days.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export async function GET(req: NextRequest) {
  const today = todayLondon();
  const yesterday = addDays(today, -1);
  const from = req.nextUrl.searchParams.get('from') || addDays(today, -14);
  const to = req.nextUrl.searchParams.get('to') || yesterday;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from < HISTORY_START || from > to) {
    return NextResponse.json({ error: `from/to must be YYYY-MM-DD, from ${HISTORY_START} onwards` }, { status: 400 });
  }

  try {
    const archive = await fetchArchive(from, to < yesterday ? to : yesterday);
    const byDate = new Map<string, WeatherDay>(archive.map(d => [d.date, d]));

    // Fill the archive's lag (usually the last ~5 days) from the forecast model.
    if (to >= addDays(today, -10)) {
      for (const d of await fetchRecent(10)) {
        if (d.date >= from && d.date <= to && !byDate.has(d.date)) byDate.set(d.date, d);
      }
    }

    const rows = Array.from(byDate.values()).map(d => ({ ...d, fetched_at: new Date().toISOString() }));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await supabase.from('weather_daily').upsert(rows.slice(i, i + 1000), { onConflict: 'date' });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({
      saved: rows.length,
      from,
      to,
      fromArchive: rows.filter(r => r.source === 'open-meteo-archive').length,
      fromForecastModel: rows.filter(r => r.source === 'open-meteo-forecast').length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
