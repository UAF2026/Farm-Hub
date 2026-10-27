import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_DAYS, checkPassword, loginConfigured, makeSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET — is the login set up? (the login page uses this to explain if not)
export async function GET() {
  return NextResponse.json({ configured: loginConfigured() });
}

// POST { password } — sets the login cookie
export async function POST(req: NextRequest) {
  if (!loginConfigured()) {
    return NextResponse.json({ error: 'Login isn’t set up yet: add HUB_PASSWORD in Vercel.' }, { status: 503 });
  }
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!(await checkPassword(String(password || '')))) {
    await new Promise(r => setTimeout(r, 800));   // slow down guessing
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await makeSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
