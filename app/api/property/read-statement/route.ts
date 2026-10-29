import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { gmailToken, gmail, pdfParts, pdfBase64, header, type GmailMessage, anthropicKey, anthropicKeyHelp } from '@/lib/gmail';

// POST { query, skip: [gmail message ids already read] } → reads the next
// letting agent's account statement PDF from Gmail and returns its lines.
// POST { pdf: <base64>, fileName } reads an uploaded statement instead (the
// agent's owner portal, since they stopped emailing them in Feb 2025).
// Either way it returns the lines
// (rent in, commission and costs out). One statement per call so it fits in
// Vercel's time limit; the Property page calls it until `done`. Saves nothing.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CATS = ['Rental income', 'Other income', 'Agent commission', 'Cleaning & laundry', 'Repairs & maintenance', 'Safety checks',
  'Utilities', 'Waste', 'Insurance', 'Council tax / business rates', 'Furnishings', 'Other'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isStatement', 'periodFrom', 'periodTo', 'lines', 'paidToOwner'],
  properties: {
    isStatement: { type: 'boolean', description: 'true if this is an owner/account statement with money lines' },
    periodFrom: { type: 'string', description: 'YYYY-MM-DD or empty' },
    periodTo: { type: 'string', description: 'YYYY-MM-DD or empty' },
    paidToOwner: { type: ['number', 'null'], description: 'Amount paid out to the owners on this statement, if shown' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'kind', 'category', 'description', 'amount', 'ref'],
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          kind: { type: 'string', enum: ['income', 'cost'] },
          category: { type: 'string', enum: CATS },
          description: { type: 'string', description: 'Short, e.g. "Booking 12-19 Jul (Smith)" or "Cleaning changeover"' },
          amount: { type: 'number', description: 'Positive £ amount' },
          ref: { type: 'string', description: 'Booking or invoice reference, or empty' },
        },
      },
    },
  },
} as const;

async function readStatement(b64: string) {
  const client = new Anthropic({ apiKey: anthropicKey() });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'This is from the letting agent for a holiday let (8 Netherton Road, Padstow) owned by James and Felicity Hunt. If it is an owner or account statement, list every money line: each booking\'s rent received as income (gross, before commission), the agent\'s commission and any costs the agent deducted or charged as costs. Leave out balances brought forward, totals and the payment to the owners itself (put that in paidToOwner). Amounts positive, dates YYYY-MM-DD.' },
      ],
    }],
  } as Parameters<typeof client.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;
  if (response.stop_reason === 'refusal') return { isStatement: false, lines: [], note: 'Claude declined to read it' };
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

export async function POST(req: NextRequest) {
  try {
    const { query = 'from:cornwallestates.co.uk has:attachment subject:statement', skip = [] as string[], pdf, fileName } = await req.json();
    if (!anthropicKey()) return NextResponse.json({ error: `The Anthropic key is not set in Vercel. ${anthropicKeyHelp()}` }, { status: 500 });
    if (pdf) {
      const b64 = String(pdf).replace(/^data:[^,]*,/, '');
      return NextResponse.json({ done: false, msgId: `upload:${fileName ?? ''}:${b64.length}`, date: new Date().toISOString().slice(0, 10), subject: fileName ?? 'Uploaded statement', fileName, remaining: 0, ...(await readStatement(b64)) });
    }
    const token = await gmailToken();
    const done = new Set<string>(skip);

    // Oldest first, so the history builds up in order.
    const ids: string[] = [];
    let pageToken = '';
    do {
      const list = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?q=${encodeURIComponent(String(query))}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`, token);
      ids.push(...(list.messages ?? []).map(m => m.id));
      pageToken = list.nextPageToken ?? '';
    } while (pageToken && ids.length < 500);
    const todo = ids.filter(id => !done.has(id)).reverse();
    if (!todo.length) return NextResponse.json({ done: true, total: ids.length });

    const msgId = todo[0];
    const msg = await gmail<GmailMessage>(`/messages/${msgId}?format=full`, token);
    const date = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString().slice(0, 10) : '';
    const base = { done: false, msgId, date, subject: header(msg, 'subject'), remaining: todo.length - 1, total: ids.length };
    const part = pdfParts(msg.payload?.parts ?? (msg.payload ? [msg.payload] : []))[0];
    if (!part) return NextResponse.json({ ...base, isStatement: false, lines: [], note: 'no PDF' });
    const b64 = await pdfBase64(msgId, part, token);
    if (!b64) return NextResponse.json({ ...base, isStatement: false, lines: [], note: 'PDF could not be downloaded' });

    return NextResponse.json({ ...base, fileName: part.filename, ...(await readStatement(b64)) });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Claude error ${e.status}: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
