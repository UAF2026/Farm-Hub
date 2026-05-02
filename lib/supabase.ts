import { createClient } from '@supabase/supabase-js';
import { FarmData } from './types';

const ROW_ID = 'farmhub_main';

export function getSupabaseClient(url: string, key: string) {
  return createClient(url, key);
}

export async function fetchFarmData(url: string, key: string): Promise<FarmData | null> {
  const supabase = getSupabaseClient(url, key);
  const { data, error } = await supabase
    .from('farmdata')
    .select('data')
    .eq('id', ROW_ID)
    .single();
  if (error || !data) return null;
  return data.data as FarmData;
}

export async function saveFarmData(url: string, key: string, farmData: FarmData): Promise<void> {
  const supabase = getSupabaseClient(url, key);
  // Read existing first so server-managed fields are preserved against stale local cache.
  const { data: existing } = await supabase.from('farmdata').select('data').eq('id', ROW_ID).single();
  const existingData = (existing?.data ?? {}) as Record<string, unknown> & { dailyBriefing?: { date?: string } };
  // Default merge — local copy wins for everything in farmData.
  const toSave: Record<string, unknown> = { ...existingData, ...farmData };
  // Server-managed keys: never overwrite from local cache. These are written by
  // scheduled tasks or the Hub's own API routes (OAuth callback, JD sync), and
  // the browser's localStorage can be hours stale.
  const PURE_SERVER_KEYS = ['jdAuth', 'jdOperations', 'jdSyncStatus'] as const;
  for (const k of PURE_SERVER_KEYS) {
    if (existingData[k] !== undefined) toSave[k] = existingData[k];
  }
  // dailyBriefing is dual-write — the Hub sets `processed: true` after creating
  // tasks/finance entries, but the scheduled task writes a fresh briefing every
  // morning. Preserve the server copy if its date is newer than what the client
  // is trying to save (prevents stale cache from clobbering today's briefing).
  const localBriefingDate = (farmData as { dailyBriefing?: { date?: string } }).dailyBriefing?.date;
  const serverBriefingDate = existingData.dailyBriefing?.date;
  if (serverBriefingDate && (!localBriefingDate || serverBriefingDate > localBriefingDate)) {
    toSave.dailyBriefing = existingData.dailyBriefing;
  }
  const { error } = await supabase
    .from('farmdata')
    .upsert({ id: ROW_ID, data: toSave, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
