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
  const { error } = await supabase
    .from('farmdata')
    .upsert({ id: ROW_ID, data: farmData, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
