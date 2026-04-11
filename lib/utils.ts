export function fmtDate(d: string): string {
  if (!d) return '';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
}

export function fmtMoney(n: number | undefined): string {
  return '£' + parseFloat(String(n || 0)).toFixed(2);
}

export function uid(): string {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

export function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T12:00:00');
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
