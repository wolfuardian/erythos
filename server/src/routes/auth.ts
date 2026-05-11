/**
 * Auth routes — GitHub OAuth + session management
 *
 * Routes:
 *   GET  /auth/me               — resolve session → 200 user | 401
 *   GET  /auth/github/start     — 302 to GitHub OAuth authorization URL
 *   GET  /auth/github/callback  — exchange code → upsert user → set cookie → 302 /
 *   POST /auth/signout          — delete session + clear cookie → 200
 *
 * OAuth state is a signed HMAC-SHA256 token to prevent CSRF (RFC 6749 §10.12).
 * The state is stored in a short-lived httpOnly cookie on /github/start and
 * verified on /github/callback.
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../db.js';
import { users } from '../db/schema.js';
import { resolveSession, createSession, deleteSession } from '../auth.js';
import { counters } from '../counters.js';

export const authRoutes = new Hono();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

const STATE_COOKIE = 'oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function stateSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

/**
 * Build an OAuth state string: `<timestamp>.<nonce>.<hmac>`
 * The HMAC signs `<timestamp>.<nonce>` with SESSION_SECRET.
 */
function createOAuthState(): string {
  const timestamp = Date.now().toString(36);
  const nonce = randomBytes(16).toString('hex');
  const payload = `${timestamp}.${nonce}`;
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verify the state received from GitHub matches the one we issued.
 * Returns false if malformed, expired, or signature-invalid.
 */
function verifyOAuthState(received: string, stored: string): boolean {
  if (!received || !stored) return false;

  const parts = received.split('.');
  if (parts.length !== 3) return false;

  const [timestamp, nonce, sig] = parts;
  const payload = `${timestamp}.${nonce}`;
  const expected = createHmac('sha256', stateSecret()).update(payload).digest('hex');

  try {
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false;
  } catch {
    return false;
  }

  // Reject states older than STATE_TTL_MS
  const issuedAt = parseInt(timestamp, 36);
  if (Date.now() - issuedAt > STATE_TTL_MS) return false;

  return true;
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string | null;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GitHub OAuth credentials not configured');

  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  const data = (await res.json()) as GitHubTokenResponse;
  if (data.error || !data.access_token) {
    throw new Error(`GitHub token exchange failed: ${data.error ?? 'no access_token'}`);
  }
  return data.access_token;
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'erythos-server',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub /user returned ${res.status}`);
  return (await res.json()) as GitHubUser;
}

async function fetchGitHubPrimaryEmail(accessToken: string): Promise<string> {
  const res = await fetch(GITHUB_EMAILS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'erythos-server',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub /user/emails returned ${res.status}`);
  const emails = (await res.json()) as GitHubEmail[];
  const primary = emails.find((e) => e.primary && e.verified);
  if (!primary) throw new Error('No verified primary email from GitHub');
  return primary.email;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /auth/me
//
// Response shape aligns with `src/core/auth/AuthClient.ts` `User` interface.
// Internal-only fields like `github_id` and `handle` stay on `AuthUser` for
// server use only. `storage_used` is surfaced as `storageUsed` (camelCase)
// for the client quota display (refs #957).
authRoutes.get('/me', async (c) => {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({
    id: user.id,
    github_login: user.github_login,
    email: user.email,
    avatar_url: user.avatar_url,
    storageUsed: user.storage_used,
  });
});

// GET /auth/github/start
authRoutes.get('/github/start', (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'GitHub OAuth not configured' }, 503);
  }

  const state = createOAuthState();

  // Store state in a short-lived cookie for CSRF verification on callback
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: STATE_TTL_MS / 1000,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'user:email',
    state,
  });

  return c.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`, 302);
});

// GET /auth/github/callback
authRoutes.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  const storedState = getCookie(c, STATE_COOKIE);

  // Always clear the state cookie
  deleteCookie(c, STATE_COOKIE, { path: '/' });

  if (!code) return c.redirect('/?auth_error=missing_code', 302);
  if (!verifyOAuthState(stateParam ?? '', storedState ?? '')) {
    return c.redirect('/?auth_error=invalid_state', 302);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const ghUser = await fetchGitHubUser(accessToken);

    // Fetch email if not available on profile (GitHub may omit it if private)
    let email = ghUser.email;
    if (!email) {
      email = await fetchGitHubPrimaryEmail(accessToken);
    }

    // Upsert user: insert or update github_login / avatar_url / email
    const result = await db
      .insert(users)
      .values({
        github_id: ghUser.id,
        email,
        github_login: ghUser.login,
        avatar_url: ghUser.avatar_url,
      })
      .onConflictDoUpdate({
        target: users.github_id,
        set: {
          github_login: ghUser.login,
          avatar_url: ghUser.avatar_url,
          email,
        },
      })
      .returning({ id: users.id });

    const userId = result[0]?.id;
    if (!userId) throw new Error('Failed to upsert user');

    await createSession(c, userId);
    counters.auth_signin_total += 1;

    // Always redirect to root after successful OAuth.
    // We do NOT honor `?redirect=` from query — it would be an open-redirect surface.
    return c.redirect('/', 302);
  } catch (err) {
    console.error('[auth/callback]', err);
    return c.redirect('/?auth_error=oauth_failed', 302);
  }
});

// POST /auth/signout
authRoutes.post('/signout', async (c) => {
  await deleteSession(c);
  counters.auth_signout_total += 1;
  return c.json({ ok: true });
});
