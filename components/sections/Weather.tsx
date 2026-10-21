'use client';

import { useEffect, useState } from 'react';
import type { WeatherResponse } from '@/app/api/weather/route';
import { ForecastDay, MonthStat, WeatherDay, workabilityHint, weatherIcon, cropYearStart } from '@/lib/weather';

const MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
const TONE: Record<string, string> = { good: 'var(--green)', ok: 'var(--amber)', bad: 'var(--red)' };

export function useWeather() {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/weather')
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || r.statusText))))
      .then(setData)
      .catch(e => setError(e.message));
  }, []);
  return { data, error };
}

function dayName(date: string, i: number) {
  if (i === 0) return 'Today';
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
}

/** Compact 7-day strip, used on the Dashboard and at the top of the Weather tab. */
export function ForecastStrip({ forecast, onOpen }: { forecast: ForecastDay[]; onOpen?: () => void }) {
  if (!forecast.length) return null;
  return (
    <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div className="card-title" style={{ margin: 0 }}>Next 7 days at Upper Assendon</div>
        {onOpen && (
          <button onClick={onOpen} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, cursor: 'pointer' }}>
            Weather →
          </button>
        )}
      </div>
      <div className="forecast-strip">
        {forecast.map((f, i) => {
          const hint = workabilityHint(f);
          return (
            <div key={f.date} className="forecast-day" title={`${f.date}: ${f.rain_mm ?? 0} mm rain (${f.rain_prob ?? '?'}% chance), wind up to ${f.wind_max_kmh} km/h, gusts ${f.gust_max_kmh} km/h`}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{dayName(f.date, i)}</div>
              <div style={{ fontSize: 20, lineHeight: 1.3 }}>{weatherIcon(f.code)}</div>
              <div style={{ fontSize: 13 }}>{Math.round(f.t_max ?? 0)}° <span style={{ color: 'var(--text-muted)' }}>{Math.round(f.t_min ?? 0)}°</span></div>
              <div style={{ fontSize: 12, color: 'var(--blue)' }}>{(f.rain_mm ?? 0) >= 0.5 ? `${Math.round(f.rain_mm!)} mm` : '–'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.wind_max_kmh}</div>
              <div style={{ fontSize: 10, fontWeight: 500, marginTop: 3, color: TONE[hint.tone] }}>{hint.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        Bottom number is top wind speed in km/h. Day guide is rough, from daily totals: “Dry, calm” = under 1 mm rain and wind under 15 km/h (about 9 mph). Check hourly before spraying.
      </div>
    </div>
  );
}

function pct(a: number, b: number | null) {
  if (!b) return '';
  const p = Math.round(((a - b) / b) * 100);
  return p === 0 ? 'same as average' : `${Math.abs(p)}% ${p > 0 ? 'above' : 'below'} average`;
}

/** Monthly rain for the current farming year (bars) against the long-term average (tick). */
function MonthlyRainChart({ months, lastDate }: { months: MonthStat[]; lastDate: string }) {
  const start = cropYearStart(lastDate);
  const startYear = Number(start.slice(0, 4));
  const monthKey = (i: number) => {
    const m = ((8 + i) % 12) + 1;
    const y = i < 4 ? startYear : startYear + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  };
  const byMonth = new Map(months.map(m => [m.month, m]));
  const avgFor = (i: number) => {
    const mm = monthKey(i).slice(5);
    const xs = months.filter(m => m.month.slice(5) === mm && m.days >= 28 && m.month < start.slice(0, 7));
    return xs.length ? xs.reduce((a, b) => a + b.rain, 0) / xs.length : 0;
  };
  const rows = MONTHS.map((label, i) => {
    const m = byMonth.get(monthKey(i));
    return { label, key: monthKey(i), rain: m?.rain ?? null, partial: !!m && m.days < 28, avg: avgFor(i) };
  });
  const max = Math.max(10, ...rows.map(r => Math.max(r.rain ?? 0, r.avg)));
  const W = 400, H = 180, padL = 30, padB = 22, padT = 8;
  const bw = (W - padL) / 12;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max].map(v => Math.round(v / 10) * 10);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
        aria-label="Monthly rainfall this farming year compared with the average">
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--gray-mid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={13} fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = padL + i * bw;
          const top = r.rain !== null ? y(r.rain) : y(0);
          return (
            <g key={r.key}>
              <title>{`${r.label}: ${r.rain !== null ? `${Math.round(r.rain)} mm${r.partial ? ' so far' : ''}` : 'not yet'} · average ${Math.round(r.avg)} mm`}</title>
              <rect x={x} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
              {r.rain !== null && r.rain > 0 && (
                <path
                  d={`M${x + 6},${y(0)} V${top + 4} a4,4 0 0 1 4,-4 H${x + bw - 10} a4,4 0 0 1 4,4 V${y(0)} Z`}
                  fill={r.partial ? 'var(--green-light)' : 'var(--green)'} opacity={r.partial ? 0.6 : 1}
                />
              )}
              {r.avg > 0 && <line x1={x + 3} x2={x + bw - 3} y1={y(r.avg)} y2={y(r.avg)} stroke="var(--text)" strokeWidth={2} />}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={13} fill="var(--text-muted)">{r.label}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginTop: 4, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green)', borderRadius: 2, marginRight: 5 }} />This farming year (mm)</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--text)', verticalAlign: 'middle', marginRight: 5 }} />Average month</span>
        <span>Faded bar = month so far</span>
      </div>
    </div>
  );
}

/** Soil temperature (0–7 cm) over the last 60 days. */
function SoilTempChart({ recent }: { recent: WeatherDay[] }) {
  const pts = recent.filter(d => d.soil_temp_c !== null);
  if (pts.length < 5) return <div className="empty">Soil temperature comes from the archive and appears once a few days are stored.</div>;
  const W = 400, H = 150, padL = 30, padB = 20, padT = 8;
  const vals = pts.map(p => p.soil_temp_c!);
  const lo = Math.floor(Math.min(0, ...vals)), hi = Math.ceil(Math.max(15, ...vals));
  const x = (i: number) => padL + (W - padL - 8) * (i / (pts.length - 1));
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.soil_temp_c!).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Soil temperature, last 60 days">
      {[lo, 5, 10, hi].filter((v, i, a) => a.indexOf(v) === i && v >= lo && v <= hi).map(t => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--gray-mid)" strokeWidth={1} strokeDasharray={t === 5 ? '4 3' : undefined} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={13} fill="var(--text-muted)">{t}°</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="var(--amber)" strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.soil_temp_c!)} r={6} fill="transparent">
          <title>{`${p.date}: soil ${p.soil_temp_c}°C, air mean ${p.t_mean}°C, rain ${p.rain_mm} mm`}</title>
        </circle>
      ))}
      <circle cx={x(pts.length - 1)} cy={y(last.soil_temp_c!)} r={4} fill="var(--amber)" stroke="var(--surface)" strokeWidth={2} />
      <text x={padL} y={H - 4} fontSize={13} fill="var(--text-muted)">{pts[0].date.slice(5).split('-').reverse().join('/')}</text>
      <text x={W - 8} y={H - 4} textAnchor="end" fontSize={13} fill="var(--text-muted)">{last.date.slice(5).split('-').reverse().join('/')}</text>
    </svg>
  );
}

export default function Weather() {
  const { data, error } = useWeather();

  if (error) return <div className="card"><div className="card-title">Weather</div><div className="empty">Couldn’t load weather: {error}</div></div>;
  if (!data) return <div className="card"><div className="empty">Loading weather…</div></div>;

  const s = data.season;
  const last7 = data.recent.slice(-7);
  const last30 = data.recent.slice(-30);
  const sum = (xs: WeatherDay[], k: keyof WeatherDay) => Math.round(xs.reduce((a, d) => a + ((d[k] as number | null) ?? 0), 0));
  const latestSoil = [...data.recent].reverse().find(d => d.soil_temp_c !== null);

  return (
    <>
      <ForecastStrip forecast={data.forecast} />

      {s && (
        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Rain since 1 Sep ({s.label})</div>
            <div className="metric-value">{s.rain} mm</div>
            <div className="metric-sub">{s.avgRain !== null ? `avg ${s.avgRain} mm · ${pct(s.rain, s.avgRain)}` : ''}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Warmth since 1 Sep</div>
            <div className="metric-value">{s.dayDegrees}</div>
            <div className="metric-sub">day-degrees above 0°C{s.avgDayDegrees ? ` · avg ${s.avgDayDegrees}` : ''}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Rain last 7 / 30 days</div>
            <div className="metric-value">{sum(last7, 'rain_mm')} / {sum(last30, 'rain_mm')}</div>
            <div className="metric-sub">mm</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Soil temp (0–7 cm)</div>
            <div className="metric-value">{latestSoil ? `${latestSoil.soil_temp_c}°` : '–'}</div>
            <div className="metric-sub">{latestSoil ? `on ${latestSoil.date.slice(5).split('-').reverse().join('/')}` : 'not yet stored'}</div>
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <div className="card-title">Rainfall by month, {s?.label ?? 'this farming year'}</div>
          {data.lastDate ? <MonthlyRainChart months={data.months} lastDate={data.lastDate} /> : <div className="empty">No weather history stored yet.</div>}
        </div>
        <div className="card">
          <div className="card-title">Soil temperature, last 60 days</div>
          <SoilTempChart recent={data.recent} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Dashed line at 5°C: roughly where grass and crop growth start and stop.</div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '1rem', lineHeight: 1.6 }}>
        History {data.firstDate ? `from ${data.firstDate.split('-').reverse().join('/')} ` : ''}to {data.lastDate?.split('-').reverse().join('/') ?? '–'}, saved automatically every morning.
        {s ? ` Averages use the same 1 Sep–${s.to.slice(5).split('-').reverse().join('/')} window in ${s.yearsInAverage} earlier years.` : ''}
        {' '}Source: Open-Meteo (ERA5 reanalysis, about a 10 km grid square centred on Upper Assendon), so it reads close to, but not exactly like, a gauge in the yard.
        {data.forecastError ? ` Forecast unavailable: ${data.forecastError}` : ''}
      </div>
    </>
  );
}
