import { NextRequest, NextResponse } from 'next/server';

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID!;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET!;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new NextResponse(`<html><body><h2>Error: ${error}</h2></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code) {
    return new NextResponse('<html><body><h2>No code returned</h2></body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const host = req.headers.get('host') || '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${proto}://${host}/api/purchases/auth/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json() as { refresh_token?: string; error?: string };

  if (tokens.error || !tokens.refresh_token) {
    return new NextResponse(
      `<html><body><h2>Token exchange failed</h2><pre>${JSON.stringify(tokens, null, 2)}</pre></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const html = `<!DOCTYPE html>
<html>
<head><title>Farm Hub — Gmail Auth</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:60px auto;padding:0 20px">
  <h2 style="color:#2d7d46">✅ Gmail authorised successfully</h2>
  <p>Copy the refresh token below and add it to Vercel as <strong>GMAIL_REFRESH_TOKEN</strong>:</p>
  <textarea
    rows="4"
    style="width:100%;font-family:monospace;font-size:13px;padding:10px;border:2px solid #2d7d46;border-radius:6px"
    onclick="this.select()"
  >${tokens.refresh_token}</textarea>
  <p style="color:#666;font-size:13px;margin-top:12px">Click the box to select all, then copy it.</p>
  <p style="color:#666;font-size:13px">Once added to Vercel, go back to Farm Hub → Purchases → Sync Gmail.</p>
</body>
</html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
