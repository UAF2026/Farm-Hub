// Server-only Gmail helpers (same Google OAuth env vars as Purchases:
// GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN).

export interface GmailPart { mimeType?: string; filename?: string; body?: { attachmentId?: string; data?: string; size?: number }; parts?: GmailPart[] }
export interface GmailMessage { id: string; internalDate?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } }

export async function gmailToken(): Promise<string> {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) throw new Error('Gmail is not connected (GMAIL_* env vars missing).');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new Error(`Gmail sign-in failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function gmail<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail error ${res.status}`);
  return res.json() as Promise<T>;
}

export const pdfParts = (parts: GmailPart[] | undefined): GmailPart[] =>
  (parts ?? []).flatMap(p => [...(p.mimeType === 'application/pdf' || /\.pdf$/i.test(p.filename ?? '') ? [p] : []), ...pdfParts(p.parts)]);

export const header = (m: GmailMessage, name: string) => m.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

/** A PDF attachment as standard base64 (Gmail sends URL-safe base64). */
export async function pdfBase64(msgId: string, part: GmailPart, token: string): Promise<string | null> {
  let data = part.body?.data;
  if (!data && part.body?.attachmentId) data = (await gmail<{ data?: string }>(`/messages/${msgId}/attachments/${part.body.attachmentId}`, token)).data;
  return data ? data.replace(/-/g, '+').replace(/_/g, '/') : null;
}

export const gmailDate = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

/** The Anthropic key from Vercel. Accepts the name James used (ANTHROPIC_KEY) as well as the usual one. */
export const anthropicKey = () => process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || '';
