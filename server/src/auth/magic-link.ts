/**
 * Magic link auth — sign-in via email link (refs docs/magic-link-spec.md).
 *
 * Pattern: opaque plaintext token held by user/email; DB stores SHA-256
 * hash only (same pattern as session tokens, refs #894). One-time use
 * enforced via used_at. 15-minute TTL.
 *
 * Email delivery is environment-gated:
 *   - With RESEND_API_KEY: send via Resend SDK
 *   - Without:             log plaintext token to stdout (dev / CI)
 *
 * Better Auth remains an unwired dependency (D3 decision; reserved for
 * future auth methods).
 */

import { randomBytes, createHash } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
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
 * Uses an atomic UPDATE … WHERE used_at IS NULL RETURNING to prevent the
 * SELECT-then-UPDATE race condition: only one concurrent request can claim
 * the row; all others see 0 rows and receive { error: 'used' } or
 * { error: 'invalid' } depending on whether the token exists at all.
 *
 * Phase 1 — atomic claim (race barrier):
 *   UPDATE magic_link_tokens SET used_at = now()
 *   WHERE token_hash = $hash AND used_at IS NULL RETURNING *
 *   0 rows → token already used or never existed; disambiguate via SELECT.
 *   1 row → this request won the race.
 *
 * Phase 2 — expiry check (post-claim):
 *   Expired tokens are consumed and burned; no session is issued.
 *
 * Phase 3 — find-or-create user using the claimed email.
 *
 * Phase 4 — bookkeeping: write user_id back to the token row.
 *
 * Caller (route handler) wraps in createSession() + 302 redirect on
 * success, or redirects with ?auth_error=<code> on error.
 */
export async function verifyMagicLink(
  tokenPlaintext: string,
): Promise<VerifyMagicLinkResult> {
  const tokenHash = hashMagicLinkToken(tokenPlaintext);

  // Phase 1 — atomic UPDATE: only one concurrent request claims the row.
  // We set only usedAt here; userId is filled in Phase 4 after find-or-create.
  const [claimed] = await db
    .update(magicLinkTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(magicLinkTokens.tokenHash, tokenHash),
        isNull(magicLinkTokens.usedAt),
      ),
    )
    .returning();

  if (!claimed) {
    // 0 rows returned — distinguish 'used' from 'invalid'
    const [exists] = await db
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash))
      .limit(1);
    if (!exists) return { error: 'invalid' };
    // Row exists but used_at was already set — another request claimed it.
    return { error: 'used' };
  }

  // Phase 2 — expiry check (after claim so the token is burned regardless)
  if (claimed.expiresAt <= new Date()) {
    return { error: 'expired' };
  }

  // Phase 3 — find-or-create user using email from the claimed row
  let userId: string;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, claimed.email))
    .limit(1);

  if (existing) {
    userId = existing.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({
        github_id: null,
        email: claimed.email,
        github_login: '',
      })
      .returning({ id: users.id });
    userId = created.id;
  }

  // Phase 4 — bookkeeping: record user_id on the token row
  await db
    .update(magicLinkTokens)
    .set({ userId })
    .where(eq(magicLinkTokens.tokenHash, tokenHash));

  return { userId };
}
