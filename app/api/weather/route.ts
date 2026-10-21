import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchForecast, todayLondon, addDays, cropYearStart, cropYearLabel,
  WeatherDay, ForecastDay, SeasonToDate, MonthStat,
} from '@/lib/weather';

// Everything the Weather tab and Dashboard strip need in one call:
// the 7-day forecast (live), the last 60 days, this farming year so far vs
// the long-term average, and monthly totals for every year on record.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface WeatherResponse {
  forecast: ForecastDay[];
  recent: WeatherDay[];
  season: SeasonToDate | null;
  months: MonthStat[];
  firstDate: string | null;
  lastDate: string | null;
  forecastError?: string;
}

type Slim = { date: string; rain_mm: number | null; t_mean: number | null };

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const today = todayLondon();

  // All history, slim columns, paged (Supabase returns at most 1000 rows per call).
  const all: Slim[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await supabase
      .from('weather_daily')
      .select('date, rain_mm, t_mean')
      .order('date')
      .range(page * 1000, page * 1000 + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...(data as Slim[]));
    if (!data || data.length < 1000) break;
  }

  const { data: recent, error: recentErr } = await supabase
    .from('weather_daily')
    .select('*')
    .gte('date', addDays(today, -60))
    .order('date');
  if (recentErr) return NextResponse.json({ error: recentErr.message }, { status: 500 });

  // Monthly totals.
  const monthMap = new Map<string, { rain: number; tSum: number; tN: number; days: number }>();
  for (const d of all) {
    const m = d.date.slice(0, 7);
    const s = monthMap.get(m) || { rain: 0, tSum: 0, tN: 0, days: 0 };
    s.rain += d.rain_mm ?? 0;
    if (d.t_mean !== null) { s.tSum += d.t_mean; s.tN++; }
    s.days++;
    monthMap.set(m, s);
  }
  const months: MonthStat[] = Array.from(monthMap.entries()).map(([month, s]) => ({
    month,
    rain: Math.round(s.rain * 10) / 10,
    tMean: s.tN ? Math.round((s.tSum / s.tN) * 10) / 10 : null,
    days: s.days,
  }));

  // This farming year so far vs the same window in every earlier complete year.
  let season: SeasonToDate | null = null;
  const lastDate = all.length ? all[all.length - 1].date : null;
  if (lastDate) {
    const start = cropYearStart(lastDate);
    const windowOf = (s: string) => {
      const yearsBack = Number(start.slice(0, 4)) - Number(s.slice(0, 4));
      const end = `${Number(lastDate.slice(0, 4)) - yearsBack}${lastDate.slice(4)}`;
      let rain = 0, dd = 0, n = 0;
      for (const d of all) {
        if (d.date < s || d.date > end) continue;
        rain += d.rain_mm ?? 0;
        dd += Math.max(0, d.t_mean ?? 0);
        n++;
      }
      return { rain, dd, n, end };
    };
    const now = windowOf(start);
    const past: { rain: number; dd: number }[] = [];
    for (let y = Number(start.slice(0, 4)) - 1; ; y--) {
      const s = `${y}-09-01`;
      if (!all.length || s < all[0].date) break;
      const w = windowOf(s);
      if (w.n >= now.n - 2) past.push(w);
    }
    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    season = {
      label: cropYearLabel(start),
      from: start,
      to: lastDate,
      rain: Math.round(now.rain),
      dayDegrees: Math.round(now.dd),
      avgRain: avg(past.map(p => p.rain)),
      avgDayDegrees: avg(past.map(p => p.dd)),
      yearsInAverage: past.length,
    };
  }

  let forecast: ForecastDay[] = [];
  let forecastError: string | undefined;
  try {
    forecast = await fetchForecast(7);
  } catch (e) {
    forecastError = (e as Error).message;
  }

  const body: WeatherResponse = {
    forecast,
    recent: (recent || []) as WeatherDay[],
    season,
    months,
    firstDate: all.length ? all[0].date : null,
    lastDate,
    forecastError,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' } });
}
