// Reads a jotted job like "ring the vet Friday" or "MOT pickup 14 March" and
// pulls out the date, the way you'd write it on a scrap of paper. No AI: plain
// rules, so it works instantly and offline. Anything it can't date is left
// undated.

import { addDaysISO } from './secretary';

export interface ParsedJob { name: string; date: string }   // date '' = no date

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Split pasted text into separate jobs, dropping bullets, numbers and tick boxes. */
export function splitJobs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•·–—]|\d+[.)]|\[[ xX]?\]|☐|☑|✓|✔)\s*/, '').trim())
    .filter(l => l.length > 1);
}

export function parseJob(text: string, today: string): ParsedJob {
  let s = text.trim();
  const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7)), d0 = Number(today.slice(8, 10));
  const dow = new Date(today + 'T12:00:00Z').getUTCDay();
  let date = '';

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => string | null) => {
    if (date) return;
    const m = s.match(re);
    if (!m) return;
    const d = fn(m);
    if (!d) return;
    date = d;
    s = (s.slice(0, m.index) + s.slice((m.index || 0) + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  };
  const lead = String.raw`(?:\b(?:by|on|due|before|for|this)\s+)?`;

  take(new RegExp(lead + String.raw`\b(today|tonight)\b`, 'i'), () => today);
  take(new RegExp(lead + String.raw`\b(tomorrow|tmrw|tmw)\b`, 'i'), () => addDaysISO(today, 1));
  take(new RegExp(lead + String.raw`\bend of (?:the )?week\b`, 'i'), () => addDaysISO(today, ((5 - dow + 7) % 7) || 7));
  take(new RegExp(lead + String.raw`\bend of (?:the )?month\b`, 'i'), () => iso(y0, m0, lastDay(y0, m0)));
  take(new RegExp(lead + String.raw`\bnext week\b`, 'i'), () => addDaysISO(today, ((1 - dow + 7) % 7) || 7));
  take(new RegExp(lead + String.raw`\bnext month\b`, 'i'), () => (m0 === 12 ? iso(y0 + 1, 1, 1) : iso(y0, m0 + 1, 1)));
  take(new RegExp(lead + String.raw`\bin (\d{1,2}|a|one|two|three|four) (day|week|month)s?\b`, 'i'), m => {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
    const n = Number(m[1]) || words[m[1].toLowerCase()] || 1;
    const unit = m[2].toLowerCase();
    if (unit === 'day') return addDaysISO(today, n);
    if (unit === 'week') return addDaysISO(today, n * 7);
    const mm = m0 + n, yy = y0 + Math.floor((mm - 1) / 12), mon = ((mm - 1) % 12) + 1;
    return iso(yy, mon, Math.min(d0, lastDay(yy, mon)));
  });
  // "14 March", "14th Mar 2027", "March 14"
  take(new RegExp(lead + String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b`, 'i'), m =>
    absolute(Number(m[1]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, m[3] ? Number(m[3]) : 0));
  take(new RegExp(lead + String.raw`\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`, 'i'), m =>
    absolute(Number(m[2]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, m[3] ? Number(m[3]) : 0));
  // "by 14/3", "14/03/27", "14.3.2027" (a bare "1/2" needs by/on/due in front, so "1/2 rate" isn't a date)
  take(new RegExp(String.raw`(?:\b(?:by|on|due|before)\s+(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?|\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4}))\b`, 'i'), mm => {
    const m = mm[1] ? [mm[0], mm[1], mm[2], mm[3]] : [mm[0], mm[4], mm[5], mm[6]];
    const yr = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : 0;
    return absolute(Number(m[1]), Number(m[2]), yr);
  });
  // "Friday", "next Friday", "by Fri" (short forms like "sat" only after by/on/next, so "sat nav" isn't Saturday)
  take(new RegExp(String.raw`(?:\b(?:by|on|due|before|this|next)\s+)?\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:by|on|due|before|this|next)\s+(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)\b`, 'i'), m => {
    const target = DAYS.indexOf((m[1] || m[2]).slice(0, 3).toLowerCase());
    const ahead = ((target - dow + 7) % 7) || 7;
    return addDaysISO(today, ahead);
  });

  function absolute(day: number, month: number, year: number): string | null {
    if (month < 1 || month > 12 || day < 1) return null;
    let yr = year || y0;
    if (day > lastDay(yr, month)) return null;
    let d = iso(yr, month, day);
    if (!year && d < today) { yr += 1; d = iso(yr, month, Math.min(day, lastDay(yr, month))); }
    return d;
  }

  s = s.replace(/\s+(?:by|on|due|before|for)$/i, '').replace(/^[,;:\s-]+|[,;:\s-]+$/g, '');
  return { name: s ? s[0].toUpperCase() + s.slice(1) : text.trim(), date };
}
