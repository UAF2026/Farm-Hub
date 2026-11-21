/**
 * Harvest year ("cropping year") helpers.
 * A cropping year runs from 1 August to 31 July: anything done from August
 * onwards (stubble sprays, drilling, pre-ems, autumn recs) is for NEXT year's
 * harvest. Combine / grass-cut jobs always count for the harvest of the year
 * they happen in, even in August.
 */
export function harvestYearOf(date?: string | null, isHarvestJob = false): string | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (!y || !m) return null;
  if (isHarvestJob) return String(y);
  return String(m >= 8 ? y + 1 : y);
}

export function currentHarvestYear(today: Date = new Date()): string {
  return String(today.getMonth() + 1 >= 8 ? today.getFullYear() + 1 : today.getFullYear());
}

/** e.g. ['2027','2026','2025','2024'] — current harvest year first. */
export function harvestYearOptions(back = 3): string[] {
  const cur = Number(currentHarvestYear());
  return Array.from({ length: back + 1 }, (_, i) => String(cur - i));
}
