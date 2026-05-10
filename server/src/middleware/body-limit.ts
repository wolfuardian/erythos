/**
 * Hono middleware: enforce 1 MB request body limit via Content-Length header.
 *
 * Why:
 * - Caddy outer fence catches abusive bodies at the proxy layer; this is the
 *   inner fence so dev (direct localhost:3000) is also covered.
 * - Place BEFORE authMiddleware so oversized unauthed requests are rejected
 *   without a DB session lookup.
 * - Streaming/chunked requests (no Content-Length) pass through — this layer
 *   only does the cheap header check, not body buffering.
 */

import type { Context, Next } from 'hono';

export const BODY_SIZE_LIMIT_BYTES = 1024 * 1024; // 1 MB

export async function bodyLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
  const cl = c.req.header('Content-Length');
  if (cl !== undefined && cl !== '') {
    const size = Number(cl);
    if (Number.isFinite(size) && size > BODY_SIZE_LIMIT_BYTES) {
      return c.json({ error: 'Payload Too Large' }, 413);
    }
  }
  await next();
}
