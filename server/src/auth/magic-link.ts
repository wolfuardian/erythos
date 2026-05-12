/**
 * Magic link auth — sign-in via email link (refs docs/magic-link-spec.md).
 *
 * Pattern: opaque plaintext token held by user/email; DB stores SHA-256
 * hash only (same pattern as session tokens, refs #894). One-time use
 * enforced via used_at. 15-minute TTL.
 *
 * Email delivery is environment-gated:
 *   - With RESEND_API_KEY: send via Resend SDK (wired in C3 follow-up)
 *   - Without:             log plaintext token to stdout (dev / CI)
 *
 * Better Auth remains an unwired dependency (D3 decision; reserved for
 * future auth methods).
 */

import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { magicLinkTokens, users } from '../db/schema.js';

export const MAGIC_LINK_TTL_MS = Number(
  process.env.MAGIC_LINK_TTL_MS ?? 15 * 60 * 1000,
);
export const MAGIC_LINK_FROM_EMAIL =
  process.env.MAGIC_LINK_FROM_EMAIL ?? 'noreply@erythos.eoswolf.com';
export const MAGIC_LINK_BASE_URL =
  process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173';

export function generateMagicLinkToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashMagicLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a magic link token for `email`.
 *
 * Inserts a row in `magic_link_tokens` with the SHA-256 hash, 15-minute
 * expiry, and `user_id` set if the email already maps to a user (the
 * verify step creates a user otherwise).
 *
 * Caller composes the link with the returned plaintext and dispatches
 * the email — this function does NOT send.
 */
export async function requestMagicLink(
  email: string,
): Promise<{ tokenPlaintext: string }> {
  const tokenPlaintext = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(tokenPlaintext);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  await db.insert(magicLinkTokens).values({
    tokenHash,
    email,
    userId: existing?.id ?? null,
    expiresAt,
  });

  return { tokenPlaintext };
}

export type VerifyMagicLinkResult =
  | { userId: string }
  | { error: 'expired' | 'used' | 'invalid' };

/**
 * Verify a magic link token.
 *
 * Hashes plaintext, looks up by token_hash, validates TTL + one-time-use,
 * find-or-creates a user by email (with github_id=null for new users —
 * nullable since C1), marks the token used, returns userId.
 *
 * Caller (route handler) wraps in createSession() + 302 redirect on
 * success, or redirects with ?auth_error=<code> on error.
 */
export async function verifyMagicLink(
  tokenPlaintext: string,
): Promise<VerifyMagicLinkResult> {
  const tokenHash = hashMagicLinkToken(tokenPlaintext);

  const [row] = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { error: 'invalid' };
  if (row.usedAt) return { error: 'used' };
  if (row.expiresAt <= new Date()) return { error: 'expired' };

  let userId: string;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, row.email))
    .limit(1);

  if (existing) {
    userId = existing.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({
        github_id: null,
        email: row.email,
        github_login: '',
      })
      .returning({ id: users.id });
    userId = created.id;
  }

  await db
    .update(magicLinkTokens)
    .set({ usedAt: new Date(), userId })
    .where(eq(magicLinkTokens.tokenHash, tokenHash));

  return { userId };
}
