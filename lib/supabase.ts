import { FarmData } from './types';

// The browser loads and saves the farm data through the Hub's own server
// (/api/farmdata, behind the login), never straight from Supabase.
// The merge rules (server keeps John Deere tokens and newer briefings) live
// in app/api/farmdata/route.ts.

export class NotLoggedIn extends Error {}

export async function fetchFarmData(): Promise<FarmData | null> {
  const res = await fetch('/api/farmdata', { cache: 'no-store' });
  if (res.status === 401) throw new NotLoggedIn();
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return (await res.json()) as FarmData;
}

export async function saveFarmData(farmData: FarmData): Promise<void> {
  const res = await fetch('/api/farmdata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(farmData),
  });
  if (res.status === 401) throw new NotLoggedIn();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Save failed (${res.status})`);
}
