import { NextRequest, NextResponse } from 'next/server';

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID!;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET!;
const REDIRECT_URI = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/purchases/auth/callback`
  : 'http://localhost:3000/api/purchases/auth/callback';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const host = req.headers.get('host') || '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${proto}://${host}/api/purchases/auth/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GMAIL_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(authUrl.toString());
}
