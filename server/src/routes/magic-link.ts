/**
 * Magic link sign-in endpoints (refs docs/magic-link-spec.md § REST API).
 *
 *   POST /api/auth/magic-link/request   { email } → 200 { ok: true } (always)
 *                                                 / 400 { error: 'invalid_email' }
 *                                                 / 429 { error: 'rate_limited' }
 *   GET  /api/auth/magic-link/verify    ?token=<plaintext> → 302
 *                                                          / + Set-Cookie session
 *                                                          / + ?auth_error=<code>
 *
 * The /request endpoint always returns 200 on per-email rate-limit hits to
 * prevent email enumeration (spec § REST API). Per-IP limits return 429.
 *
 * Email delivery is stubbed in C2 — token plaintext is logged to stdout.
 * C3 follow-up wires the Resend SDK behind an env-gate on RESEND_API_KEY.
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  requestMagicLink,
  verifyMagicLink,
  MAGIC_LINK_BASE_URL,
} from '../auth/magic-link.js';
import { createSession } from '../auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

export const magicLinkRoutes = new Hono();

const requestSchema = z.object({
  email: z.string().email(),
});

/**
 * Resolve the client IP for rate-limit keying.
 *
 * Reads the LAST entry of X-Forwarded-For, not the first. Caddy (and
 * most reverse proxies) appends the connecting socket's IP to the tail
 * of XFF; client-supplied entries precede it. Taking [0] would allow
 * an attacker to forge X-Forwarded-For with a rotating fake IP each
 * request and bypass per-IP rate limits entirely.
 *
 * Trust assumption: Caddy is the immediate proxy in front of Hono. If
 * an additional hop is introduced (eg. Cloudflare in front of Caddy),
 * the trustworthy entry is still last but the count of trusted tail
 * entries grows — revisit this if topology changes.
 */
function clientIP(c: Context): string {
  const xff = c.req.header('X-Forwarded-For');
  if (xff) {
    const parts = xff.split(',');
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  // No proxy in front (dev / direct connection); all such requests share
  // the same rate-limit bucket. Acceptable for local dev.
  return 'unknown';
}

magicLinkRoutes.post('/request', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_email' }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_email' }, 400);
  }
  const { email } = parsed.data;
  const ip = clientIP(c);

  // Per-IP rate limit (10/hour) — surfaced publicly as 429
  if (!checkRateLimit(`ml:req:ip:${ip}`, 60 * 60 * 1000, 10)) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  // Per-email rate limit (1/60s) — silently absorbed to prevent
  // enumeration of registered emails (spec § Rate Limit § 防 enumeration)
  if (!checkRateLimit(`ml:req:email:${email}`, 60 * 1000, 1)) {
    return c.json({ ok: true }, 200);
  }

  const { tokenPlaintext } = await requestMagicLink(email);
  const link = `${MAGIC_LINK_BASE_URL}/api/auth/magic-link/verify?token=${tokenPlaintext}`;

  // SECURITY: stub mode logs plaintext token to stdout. C3 must replace
  // both branches with a real Resend send (no plaintext to journal).
  // Acceptable for C2 because the endpoint has no client UI yet (D1
  // pending) and prod log access is restricted to root SSH.
  if (process.env.RESEND_API_KEY) {
    console.warn(
      '[magic-link] RESEND_API_KEY is set but Resend SDK is not yet wired (C3 pending);',
      `logging plaintext link to ${email} instead of sending email`,
    );
    console.log(`[magic-link] ${email} → ${link}`);
  } else {
    console.log(
      `[magic-link] (no RESEND_API_KEY, dev mode) ${email} → ${link}`,
    );
  }

  return c.json({ ok: true }, 200);
});

magicLinkRoutes.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.redirect('/?auth_error=invalid', 302);

  const ip = clientIP(c);

  // Per-IP verify rate limit (20/min) — protects against brute-force
  // enumeration of token-space (spec § Rate Limit per-IP verify).
  if (!checkRateLimit(`ml:verify:ip:${ip}`, 60 * 1000, 20)) {
    return c.redirect('/?auth_error=rate_limited', 302);
  }

  const result = await verifyMagicLink(token);
  if ('error' in result) {
    return c.redirect(`/?auth_error=${result.error}`, 302);
  }

  await createSession(c, result.userId);
  return c.redirect('/', 302);
});
