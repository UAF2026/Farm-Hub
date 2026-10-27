// Login for the Hub. One password (HUB_PASSWORD in Vercel) gets a signed
// cookie that lasts about a year, so phone and laptop stay logged in.
// Runs in the Edge middleware too, so it only uses Web Crypto.
//
// The cookie is "<issued>.<signature>". The signing key is made from the
// password and the Supabase service key, so changing the password logs every
// device out.

export const SESSION_COOKIE = 'hub_session';
export const SESSION_DAYS = 400;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = '';
  new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(message: string): Promise<string> {
  const secret = `${process.env.HUB_PASSWORD || ''}|${process.env.SUPABASE_SERVICE_KEY || ''}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function loginConfigured(): boolean {
  return !!process.env.HUB_PASSWORD && !!process.env.SUPABASE_SERVICE_KEY;
}

export async function checkPassword(password: string): Promise<boolean> {
  if (!loginConfigured()) return false;
  // Compare signatures rather than the raw strings, so timing gives nothing away.
  return sameString(await hmac(`pw.${password}`), await hmac(`pw.${process.env.HUB_PASSWORD}`));
}

export async function makeSession(): Promise<string> {
  const issued = Date.now().toString(36);
  return `${issued}.${await hmac(`session.${issued}`)}`;
}

export async function verifySession(token?: string): Promise<boolean> {
  if (!token || !loginConfigured()) return false;
  const [issued, sig] = token.split('.');
  if (!issued || !sig) return false;
  const age = Date.now() - parseInt(issued, 36);
  if (!(age >= 0 && age < SESSION_DAYS * 86400000)) return false;
  return sameString(sig, await hmac(`session.${issued}`));
}
