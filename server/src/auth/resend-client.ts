/**
 * Resend SDK wrapper for magic link email delivery (F-5 C3).
 *
 * Env-gated: RESEND_API_KEY set → send via Resend; unset → log to stdout
 * (dev / CI friendly).
 *
 * Error handling: Resend failures are caught and logged; the caller still
 * returns 200 to the HTTP client (anti-enumeration: the /request endpoint
 * must not leak server-side delivery status to the caller).
 *
 * Resend client is constructed lazily (inside the function, not at module
 * scope) so that tests that run without RESEND_API_KEY don't need to
 * initialize the SDK at import time.
 */

import { Resend } from 'resend';
import { logger } from '../middleware/logger.js';
import { MAGIC_LINK_FROM_EMAIL } from './magic-link.js';

export interface SendMagicLinkEmailOptions {
  to: string;
  link: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send (or stub) a magic link email.
 *
 * With RESEND_API_KEY set: sends via Resend SDK.
 * Without:                logs plaintext link to stdout (dev-friendly).
 *
 * Resend send errors are caught + logged; caller always returns 200
 * (anti-enumeration: delivery failure must not be surfaced to the client).
 */
export async function sendMagicLinkEmail({
  to,
  link,
  subject,
  html,
  text,
}: SendMagicLinkEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev / CI stub — log the link so local sign-in flows still work
    console.log(`[magic-link][STUB] ${to} → ${link}`);
    return;
  }

  // Lazy construction: client is built only when the key is present,
  // keeping import-time side-effects away from test environments.
  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from: MAGIC_LINK_FROM_EMAIL,
      to,
      subject,
      html,
      text,
    });
  } catch (err) {
    // Log the failure but do NOT propagate. The /request endpoint must
    // return 200 regardless — anti-enumeration takes priority over
    // exposing delivery-failure signals to the caller.
    // Prod ops: inspect with  journalctl -u erythos-server | grep "send failed"
    logger.error({ err, to }, '[magic-link] send failed');
  }
}
