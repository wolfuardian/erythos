/**
 * Auth utilities — session cookie helpers and session resolution.
 *
 * D3 implementation note: Better Auth (already in package.json) was evaluated
 * but not wired as the primary OAuth engine because the D2 schema's users /
 * sessions tables don't align with Better Auth's required schema (missing
 * `account`, `verification` tables; missing `emailVerified`, `name`, `token`,
 * `updatedAt` columns). Wiring Better Auth would require adding an incremental
 * migration that diverges from the spec's data model (§ 資料模型).
 *
 * Instead, the OAuth flow is implemented as a thin custom layer that maps
 * exactly onto the D2 schema.  Better Auth remains a declared dependency for
 * future auth methods (email/password, magic link — § 認證實作 "v0.1 後加題").
 *
 * Session cookie spec (§ 認證實作):
 *   httpOnly; Secure (prod); SameSite=Lax
 *   Value = opaque random token stored as sessions.id in Postgres
 */

import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from './db.js';
import { sessions, users } from './db/schema.js';
import { eq } from 'drizzle-orm';

export const SESSION_COOKIE = 'session';

/** 30-day expiry (seconds) */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Generate a cryptographically random session token */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** Write session cookie onto the response */
export function setSessionCookie(c: Context, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Clear session cookie */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Resolved authenticated user (subset returned by /auth/me) */
export interface AuthUser {
  id: string;
  github_id: number;
  handle: string | null;
  storage_used: number;
}

/**
 * Resolve the session cookie to a user row.
 * Returns null if cookie is absent, expired, or not found.
 */
export async function resolveSession(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const now = new Date();

  const rows = await db
    .select({
      id: users.id,
      github_id: users.github_id,
      handle: users.handle,
      storage_used: users.storage_used,
      expires_at: sessions.expires_at,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(eq(sessions.id, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expires_at <= now) return null;

  return {
    id: row.id,
    github_id: row.github_id,
    handle: row.handle,
    storage_used: row.storage_used,
  };
}

/**
 * Create a session row in Postgres and set the cookie.
 * Returns the session token.
 */
export async function createSession(c: Context, userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: token,
    user_id: userId,
    expires_at: expiresAt,
  });

  setSessionCookie(c, token);
  return token;
}

/**
 * Delete the session row from Postgres and clear the cookie.
 * Silently no-ops if the cookie is absent.
 */
export async function deleteSession(c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  clearSessionCookie(c);
}
