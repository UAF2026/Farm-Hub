import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Force Node.js runtime — Edge runtime doesn't support node:crypto or Buffer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// John Deere OAuth — callback. Deere bounces the user here after they've
// approved access. We exchange the authorization code for an access + refresh
// token pair, then store the tokens in farmdata.jdAuth so the rest of the Hub
// can call Deere's APIs on the user's behalf.

const JD_CLIENT_ID = process.env.JD_CLIENT_ID;
const JD_CLIENT_SECRET = process.env.JD_CLIENT_SECRET;
const JD_AUTH_SERVER =
  process.env.JD_AUTH_SERVER || 'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7';
const JD_API_BASE = process.env.JD_API_BASE || 'https://partnerapi.deere.com/platform';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const STATE_SECRET = process.env.API_SECRET || 'change-me-please';
const ROW_ID = 'farmhub_main';

function verifyState(state: string): boolean {
  const [ts, sig] = state.split('.');
  if (!ts || !sig) return false;
  const expected = crypto
    .createHmac('sha256', STATE_SECRET)
    .update(ts)
    .digest('hex')
    .slice(0, 24);
  if (sig !== expected) return false;
  // Reject states older than 15 minutes — anything that takes longer is suspect.
  if (Date.now() - parseInt(ts, 10) > 15 * 60 * 1000) return false;
  return true;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

interface OrgEntry {
  id: string;
  name: string;
  type?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  // User declined or Deere returned an error — surface it plainly.
  if (errParam) {
    return NextResponse.json(
      {
        error: errParam,
        description: url.searchParams.get('error_description'),
      },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state in callback' }, { status: 400 });
  }
  if (!verifyState(state)) {
    return NextResponse.json(
      { error: 'Invalid or expired state — please retry the Connect flow' },
      { status: 400 }
    );
  }
  if (!JD_CLIENT_ID || !JD_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'JD_CLIENT_ID / JD_CLIENT_SECRET not configured in environment' },
      { status: 500 }
    );
  }

  const origin = url.origin;
  const redirectUri = `${origin}/api/jd/callback`;

  // Discover the token endpoint via well-known config (with fallback).
  let tokenEndpoint = `${JD_AUTH_SERVER}/v1/token`;
  try {
    const wk = await fetch(`${JD_AUTH_SERVER}/.well-known/oauth-authorization-server`, {
      cache: 'no-store',
    });
    if (wk.ok) {
      const cfg = await wk.json();
      if (cfg.token_endpoint) tokenEndpoint = cfg.token_endpoint;
    }
  } catch {
    // Use fallback endpoint.
  }

  // Exchange the authorization code for tokens.
  const basicAuth = Buffer.from(`${JD_CLIENT_ID}:${JD_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.json(
      { error: 'Token exchange with John Deere failed', status: tokenRes.status, body: text },
      { status: 500 }
    );
  }

  const tokens = (await tokenRes.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  // Fetch the user's organisations as a sanity check + so we can show "Connected to N orgs"
  // on the Settings page once we wire that up. Don't fail the callback if this fetch errors —
  // tokens are still valid.
  let orgs: OrgEntry[] = [];
  try {
    const orgRes = await fetch(`${JD_API_BASE}/organizations`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/vnd.deere.axiom.v3+json',
      },
    });
    if (orgRes.ok) {
      const orgData = (await orgRes.json()) as { values?: OrgEntry[] };
      orgs = (orgData.values || []).map((o) => ({ id: o.id, name: o.name, type: o.type }));
    }
  } catch {
    // Swallow — orgs list is informational only.
  }

  // Persist the tokens into farmdata.jdAuth so subsequent API routes can use them.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: existing } = await supabase
    .from('farmdata')
    .select('data')
    .eq('id', ROW_ID)
    .single();
  const current = (existing as { data: Record<string, unknown> } | null)?.data ?? {};
  const merged = {
    ...current,
    jdAuth: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt,
      tokenType: tokens.token_type || 'Bearer',
      scope: tokens.scope || '',
      orgs,
      connectedAt: new Date().toISOString(),
      apiBase: JD_API_BASE,
    },
  };
  const { error: saveErr } = await supabase
    .from('farmdata')
    .upsert({ id: ROW_ID, data: merged, updated_at: new Date().toISOString() });

  if (saveErr) {
    return NextResponse.json(
      { error: 'Token received but Supabase save failed', detail: saveErr.message },
      { status: 500 }
    );
  }

  // Send the user back to the Hub with a success indicator.
  return NextResponse.redirect(
    `${origin}/?jd=connected&orgs=${orgs.length}&scope=${encodeURIComponent(tokens.scope || '')}`
  );
}
