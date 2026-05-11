/**
 * Unit tests for bodyLimitMiddleware.
 *
 * Strategy: mount only the middleware on a tiny Hono app with a dummy route.
 * No db mocking needed — middleware has no external dependencies.
 *
 * Covered:
 *   - body exactly 1 MB (BODY_SIZE_LIMIT_BYTES) → next() called → 200
 *   - body 1 MB + 1 byte                        → 413
 *   - body 2 MB                                 → 413
 *   - no Content-Length header                  → next() called → not 413
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { bodyLimitMiddleware, BODY_SIZE_LIMIT_BYTES } from '../middleware/body-limit.js';

const app = new Hono();
app.post('/test', bodyLimitMiddleware, (c) => c.json({ ok: true }));

function makeBodyRequest(size: number): Request {
  const body = 'a'.repeat(size);
  return new Request('http://localhost/test', {
    method: 'POST',
    body,
    headers: { 'Content-Length': String(size) },
  });
}

function makeStreamRequest(): Request {
  const encoder = new TextEncoder();
  const chunk = encoder.encode('hello');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request('http://localhost/test', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('bodyLimitMiddleware', () => {
  it('passes when body is exactly BODY_SIZE_LIMIT_BYTES (1 MB)', async () => {
    const res = await app.request(makeBodyRequest(BODY_SIZE_LIMIT_BYTES));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 413 when body is BODY_SIZE_LIMIT_BYTES + 1 byte', async () => {
    const res = await app.request(makeBodyRequest(BODY_SIZE_LIMIT_BYTES + 1));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toEqual({ error: 'Payload Too Large' });
  });

  it('returns 413 when body is 2 MB', async () => {
    const res = await app.request(makeBodyRequest(BODY_SIZE_LIMIT_BYTES * 2));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toEqual({ error: 'Payload Too Large' });
  });

  it('passes when there is no Content-Length header (streaming / chunked)', async () => {
    const res = await app.request(makeStreamRequest());
    expect(res.status).not.toBe(413);
  });
});
