import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function getClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// GET — fetch all entries, newest first
export async function GET() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('brain_dump')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — save a new entry
export async function POST(req: NextRequest) {
  const supabase = getClient();
  const body = await req.json();
  const { content, tag } = body;
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const { data, error } = await supabase
    .from('brain_dump')
    .insert({ content: content.trim(), tag: tag ?? 'untagged', status: 'open' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — update status or tag on an entry
export async function PATCH(req: NextRequest) {
  const supabase = getClient();
  const body = await req.json();
  const { id, status, tag, notes } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, string> = {};
  if (status) { updates.status = status; if (status === 'actioned') updates.actioned_at = new Date().toISOString(); }
  if (tag) updates.tag = tag;
  if (notes !== undefined) updates.notes = notes;

  const { error } = await supabase.from('brain_dump').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE — remove an entry
export async function DELETE(req: NextRequest) {
  const supabase = getClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase.from('brain_dump').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
