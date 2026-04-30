import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Force Node.js runtime — Edge runtime doesn't support node:crypto.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// John Deere OAuth — start of the connect flow.
// User hits /api/jd/authorize, we generate a CSRF-protected state token,
// then bounce them to Deere's sign-in page. Deere bounces them back to
// /api/jd/callback with an authorization code.

const JD_CLIENT_ID = process.env.JD_CLIENT_ID;
const JD_SCOPES =
  process.env.JD_SCOPES ||
  // Default ask. Deere returns whatever was actually approved; unapproved scopes are silently dropped.
  'ag1 ag2 ag3 eq1 eq2 files offline_access';
const JD_AUTH_SERVER =
  process.env.JD_AUTH_SERVER || 'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7';
const STATE_SECRET = process.env.API_SECRET || 'change-me-please';

function makeState(): string {
  // Signed timestamp — verified in callback to prevent CSRF / stale callbacks.
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(ts).digest('hex').slice(0, 24);
  return `${ts}.${sig}`;
}

export async function GET(req: NextRequest) {
  if (!JD_CLIENT_ID) {
    return NextResponse.json(
      { error: 'JD_CLIENT_ID is not configured. Set it in Vercel environment variables.' },
      { status: 500 }
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/jd/callback`;

  // Discover the actual authorize endpoint via Deere's well-known config.
  // Falls back to the documented default if the well-known fetch fails.
  let authorizeEndpoint = `${JD_AUTH_SERVER}/v1/authorize`;
  try {
    const wk = await fetch(`${JD_AUTH_SERVER}/.well-known/oauth-authorization-server`, {
      // Avoid Next caching the well-known response between requests.
      cache: 'no-store',
    });
    if (wk.ok) {
      const cfg = await wk.json();
      if (cfg.authorization_endpoint) authorizeEndpoint = cfg.authorization_endpoint;
    }
  } catch {
    // Use the fallback endpoint silently.
  }

  const state = makeState();
  const url = new URL(authorizeEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', JD_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', JD_SCOPES);
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
