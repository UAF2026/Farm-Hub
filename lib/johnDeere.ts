// John Deere API helpers — token refresh + authenticated fetch.
//
// Tokens are stored in farmdata.jdAuth (set by /api/jd/callback).
// Access tokens last ~12 hours; refresh tokens last ~365 days as long
// as they're used at least once. This module reads the stored token,
// refreshes it if it's about to expire, persists the new token back,
// then returns a Bearer string ready for API calls.

import { createClient } from '@supabase/supabase-js';

const JD_AUTH_SERVER =
  process.env.JD_AUTH_SERVER || 'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7';
const JD_CLIENT_ID = process.env.JD_CLIENT_ID;
const JD_CLIENT_SECRET = process.env.JD_CLIENT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ROW_ID = 'farmhub_main';

export interface JdOrg {
  id: string;
  name: string;
  type?: string;
}

export interface JdAuth {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  tokenType: string;
  scope: string;
  orgs: JdOrg[];
  connectedAt: string;
  apiBase: string;
}

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

function requireEnv(): { url: string; key: string; clientId: string; clientSecret: string } {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
  }
  if (!JD_CLIENT_ID || !JD_CLIENT_SECRET) {
    throw new Error('John Deere client credentials missing (JD_CLIENT_ID / JD_CLIENT_SECRET)');
  }
  return {
    url: SUPABASE_URL,
    key: SUPABASE_SERVICE_KEY,
    clientId: JD_CLIENT_ID,
    clientSecret: JD_CLIENT_SECRET,
  };
}

async function discoverTokenEndpoint(): Promise<string> {
  const fallback = `${JD_AUTH_SERVER}/v1/token`;
  try {
    const wk = await fetch(`${JD_AUTH_SERVER}/.well-known/oauth-authorization-server`, {
      cache: 'no-store',
    });
    if (wk.ok) {
      const cfg = (await wk.json()) as { token_endpoint?: string };
      if (cfg.token_endpoint) return cfg.token_endpoint;
    }
  } catch {
    /* fall through to default */
  }
  return fallback;
}

/**
 * Returns a valid access token, refreshing transparently if needed.
 * Throws if no jdAuth is stored or the refresh fails.
 */
export async function getValidToken(): Promise<{ token: string; auth: JdAuth }> {
  const env = requireEnv();
  const supabase = createClient(env.url, env.key);

  const { data, error } = await supabase
    .from('farmdata')
    .select('data')
    .eq('id', ROW_ID)
    .single();
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);

  const blob = (data as { data?: Record<string, unknown> } | null)?.data ?? {};
  const auth = (blob as { jdAuth?: JdAuth }).jdAuth;
  if (!auth) {
    throw new Error('No John Deere connection. Visit /api/jd/authorize to connect.');
  }

  // 60-second safety margin so we don't hand out a token that expires mid-request.
  const expiresAt = new Date(auth.expiresAt).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return { token: auth.accessToken, auth };
  }

  // Token has expired (or is about to) — refresh.
  if (!auth.refreshToken) {
    throw new Error(
      'Access token expired and no refresh token is stored. Re-connect via /api/jd/authorize.'
    );
  }

  const tokenEndpoint = await discoverTokenEndpoint();
  const basicAuth = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64');

  const refreshRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
    }).toString(),
  });

  if (!refreshRes.ok) {
    const text = await refreshRes.text();
    throw new Error(
      `Token refresh failed (${refreshRes.status}). ${text.slice(0, 300)}. Re-connect via /api/jd/authorize.`
    );
  }

  const fresh = (await refreshRes.json()) as RefreshResponse;
  const newAuth: JdAuth = {
    ...auth,
    accessToken: fresh.access_token,
    // Deere returns a *new* refresh token on each refresh; if it ever omits one, keep the old.
    refreshToken: fresh.refresh_token || auth.refreshToken,
    expiresAt: new Date(Date.now() + (fresh.expires_in - 60) * 1000).toISOString(),
    tokenType: fresh.token_type || auth.tokenType,
    scope: fresh.scope || auth.scope,
  };

  // Persist the rotated token back into farmdata.jdAuth.
  const { data: existing } = await supabase
    .from('farmdata')
    .select('data')
    .eq('id', ROW_ID)
    .single();
  const current = (existing as { data?: Record<string, unknown> } | null)?.data ?? {};
  const merged = { ...current, jdAuth: newAuth };
  const { error: saveErr } = await supabase
    .from('farmdata')
    .upsert({ id: ROW_ID, data: merged, updated_at: new Date().toISOString() });
  if (saveErr) {
    // Token works for this request, but warn the caller — next call will retry refresh.
    console.error('JD token refresh succeeded but Supabase save failed:', saveErr.message);
  }

  return { token: newAuth.accessToken, auth: newAuth };
}

/**
 * Authenticated GET against the John Deere API. `path` may be either:
 *   - a path beginning with "/" — appended to apiBase
 *   - a full URL (e.g. a "next" link from a paginated response)
 *
 * Returns the parsed JSON body. Throws with status + body on non-2xx.
 */
export async function jdFetch<T = unknown>(
  path: string,
  token: string,
  apiBase: string
): Promise<T> {
  const url = path.startsWith('http') ? path : `${apiBase}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.deere.axiom.v3+json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`John Deere ${url} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}
