/**
 * Magic link auth — unwired skeleton (refs #956).
 *
 * Spec 定稿中(refs #955)。本檔不 mount 進 server/src/index.ts,等 spec
 * finalize 後另開 wire-up issue。
 *
 * Pattern 沿用 server/src/auth.ts D3 self-rolled OAuth:
 *   - opaque random plaintext token(client/email holds)
 *   - sha256(token) 存 DB(refs #894)
 *   - one-time use(usedAt 欄位設定後不可再用)
 *   - TTL 15 min
 *
 * 不引入 better-auth wire(D3 已決:Better Auth declared but unwired)。
 */

import { randomBytes, createHash } from 'node:crypto';

export const MAGIC_LINK_TTL_MS = Number(process.env.MAGIC_LINK_TTL_MS ?? 15 * 60 * 1000);
export const MAGIC_LINK_FROM_EMAIL =
  process.env.MAGIC_LINK_FROM_EMAIL ?? 'noreply@example.com';
export const MAGIC_LINK_BASE_URL =
  process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173';
// RESEND_API_KEY: 暫不讀,等 wire-up 階段引入 resend SDK

export function generateMagicLinkToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashMagicLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate + persist magic link token. **Does NOT send email**(等 spec #955
 * 確定 + Resend SDK 引入後另開 issue wire 寄信).
 *
 * @returns plaintext token(讓未來測試 / 寄信流程拿)
 */
export async function requestMagicLink(
  _email: string,
): Promise<{ tokenPlaintext: string }> {
  // TODO: integrate after spec #955 finalized
  //   1. validate email format
  //   2. rate limit check
  //   3. find or note user_id(由 email 找,nullable)
  //   4. INSERT INTO magic_link_tokens (token_hash, email, user_id, expires_at)
  //   5. return plaintext for sending step
  const tokenPlaintext = generateMagicLinkToken();
  return { tokenPlaintext };
}

/**
 * Verify magic link token. Looks up by hash, checks TTL + one-time use,
 * marks usedAt + returns user_id(or creates user if email new).
 */
export async function verifyMagicLink(
  _tokenPlaintext: string,
): Promise<{ userId: string } | { error: 'expired' | 'used' | 'invalid' }> {
  // TODO: integrate after spec #955 finalized
  //   1. hash plaintext
  //   2. SELECT FROM magic_link_tokens WHERE token_hash = $1
  //   3. if !found return invalid; if used_at return used; if expires_at < now return expired
  //   4. UPDATE used_at = now
  //   5. ensure user exists(email match or create); return user_id
  return { error: 'invalid' };
}

// 未來 routes(refs #955 spec 章節 § REST API):
//   POST /api/auth/magic-link/request  → requestMagicLink
//   GET  /api/auth/magic-link/verify   → verifyMagicLink → setSessionCookie + redirect
// 待 spec 定稿後在 server/src/routes/ 新增並 mount 到 index.ts。
