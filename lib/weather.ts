// Weather for Upper Assendon Farm, from Open-Meteo (free, no key needed).
//
// History: Open-Meteo's archive (ERA5 reanalysis) goes back to 1940 and runs
// about 5 days behind today. The last few days are filled from the forecast
// API's "past days" and overwritten by archive data on later syncs.
// Stored one row per day in the Supabase `weather_daily` table by
// /api/weather/sync, which Vercel cron calls every morning (see vercel.json).

export const FARM_LAT = 51.567;   // Upper Assendon, RG9 6AU
export const FARM_LON = -0.925;
export const HISTORY_START = '2000-01-01';

export interface WeatherDay {
  date: string;              // YYYY-MM-DD
  t_max: number | null;
  t_min: number | null;
  t_mean: number | null;
  rain_mm: number | null;
  et0_mm: number | null;
  sunshine_h: number | null;
  wind_max_kmh: number | null;
  radiation_mj: number | null;
  soil_temp_c: number | null;
  soil_moisture: number | null;
  source: string;
}

export interface ForecastDay {
  date: string;
  t_max: number | null;
  t_min: number | null;
  rain_mm: number | null;
  rain_prob: number | null;  // %
  wind_max_kmh: number | null;
  gust_max_kmh: number | null;
  code: number | null;       // WMO weather code
}

const ARCHIVE_DAILY = [
  'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
  'precipitation_sum', 'et0_fao_evapotranspiration', 'sunshine_duration',
  'wind_speed_10m_max', 'shortwave_radiation_sum',
  'soil_temperature_0_to_7cm_mean', 'soil_moisture_0_to_7cm_mean',
];
const RECENT_DAILY = [
  'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
  'precipitation_sum', 'et0_fao_evapotranspiration', 'sunshine_duration',
  'wind_speed_10m_max', 'shortwave_radiation_sum',
];

type DailyBlock = Record<string, (number | null)[]> & { time: string[] };

async function getDaily(url: string): Promise<DailyBlock> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.daily as DailyBlock;
}

const round = (v: number | null | undefined, dp = 1) =>
  v === null || v === undefined ? null : Math.round(v * 10 ** dp) / 10 ** dp;

function toDays(d: DailyBlock, source: string): WeatherDay[] {
  return d.time.map((date, i) => ({
    date,
    t_max: round(d.temperature_2m_max?.[i]),
    t_min: round(d.temperature_2m_min?.[i]),
    t_mean: round(d.temperature_2m_mean?.[i]),
    rain_mm: round(d.precipitation_sum?.[i]),
    et0_mm: round(d.et0_fao_evapotranspiration?.[i]),
    sunshine_h: d.sunshine_duration?.[i] == null ? null : round(d.sunshine_duration[i]! / 3600),
    wind_max_kmh: round(d.wind_speed_10m_max?.[i]),
    radiation_mj: round(d.shortwave_radiation_sum?.[i]),
    soil_temp_c: round(d.soil_temperature_0_to_7cm_mean?.[i]),
    soil_moisture: round(d.soil_moisture_0_to_7cm_mean?.[i], 3),
    source,
  }));
}

/** Observed daily weather from the archive. Days the archive hasn't caught up on yet are left out. */
export async function fetchArchive(from: string, to: string): Promise<WeatherDay[]> {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${FARM_LAT}&longitude=${FARM_LON}` +
    `&start_date=${from}&end_date=${to}&daily=${ARCHIVE_DAILY.join(',')}&timezone=Europe%2FLondon`;
  return toDays(await getDaily(url), 'open-meteo-archive').filter(d => d.t_max !== null);
}

/** The last `pastDays` days from the forecast model, to cover the archive's few-day lag. */
export async function fetchRecent(pastDays: number): Promise<WeatherDay[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}` +
    `&daily=${RECENT_DAILY.join(',')}&past_days=${pastDays}&forecast_days=1&timezone=Europe%2FLondon`;
  const today = todayLondon();
  return toDays(await getDaily(url), 'open-meteo-forecast').filter(d => d.date < today && d.t_max !== null);
}

export async function fetchForecast(days = 7): Promise<ForecastDay[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,` +
    `wind_speed_10m_max,wind_gusts_10m_max,weather_code&forecast_days=${days}&timezone=Europe%2FLondon`;
  const d = await getDaily(url);
  return d.time.map((date, i) => ({
    date,
    t_max: round(d.temperature_2m_max?.[i]),
    t_min: round(d.temperature_2m_min?.[i]),
    rain_mm: round(d.precipitation_sum?.[i]),
    rain_prob: d.precipitation_probability_max?.[i] ?? null,
    wind_max_kmh: round(d.wind_speed_10m_max?.[i], 0),
    gust_max_kmh: round(d.wind_gusts_10m_max?.[i], 0),
    code: d.weather_code?.[i] ?? null,
  }));
}

export function todayLondon(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ─── Summaries (shared by the API route and the UI) ──────────────────────── */

/** Farming year runs 1 Sep – 31 Aug, labelled by harvest, e.g. 1 Sep 2026 → '26/27'. */
export function cropYearStart(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return `${m >= 9 ? y : y - 1}-09-01`;
}

export function cropYearLabel(start: string): string {
  const y = Number(start.slice(0, 4));
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
}

export interface SeasonToDate {
  label: string;          // '26/27'
  from: string;
  to: string;
  rain: number;
  dayDegrees: number;     // sum of daily mean temp above 0°C (base used for wheat)
  avgRain: number | null; // same window, average over earlier years
  avgDayDegrees: number | null;
  yearsInAverage: number;
}

export interface MonthStat {
  month: string;          // YYYY-MM
  rain: number;
  tMean: number | null;
  days: number;
}

/** Simple "can I get on" read of a forecast day. Rough guide only, from daily figures. */
export function workabilityHint(f: ForecastDay): { label: string; tone: 'good' | 'ok' | 'bad' } {
  const rain = f.rain_mm ?? 0;
  const wind = f.wind_max_kmh ?? 0;
  if (rain >= 5) return { label: 'Wet', tone: 'bad' };
  if (rain < 1 && wind <= 15) return { label: 'Dry, calm', tone: 'good' };
  if (rain < 1) return { label: 'Dry, windy', tone: 'ok' };
  return { label: 'Showers', tone: 'ok' };
}

export function weatherIcon(code: number | null): string {
  if (code === null) return '';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}
