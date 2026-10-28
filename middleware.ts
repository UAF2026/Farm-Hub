import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

// Every page and API route needs the login cookie, except the login page
// itself, the morning weather save (it only writes public weather data) and
// the nightly backup (it only copies the data into the backups table).
// Scheduled jobs can still call /api routes with API_SECRET (header
// x-api-secret or ?secret=). The route sees how it was let in via the
// x-hub-auth header ('session' or 'secret'), which this middleware always
// sets itself, so it can't be faked from outside.

const OPEN = new Set(['/login', '/api/login', '/api/weather/sync', '/api/backup']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.delete('x-hub-auth');

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (OPEN.has(pathname)) {
    // Still tell open routes when it's James, so /api/backup?force=1 works for him only.
    if (session) headers.set('x-hub-auth', 'session');
    return NextResponse.next({ request: { headers } });
  }

  const secret = process.env.API_SECRET;
  const provided = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret');
  const bySecret = !!secret && pathname.startsWith('/api/') && provided === secret;

  if (session || bySecret) {
    headers.set('x-hub-auth', session ? 'session' : 'secret');
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own files and the icons/manifest a phone fetches before logging in.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|apple-touch-icon.png|manifest.webmanifest).*)'],
};
