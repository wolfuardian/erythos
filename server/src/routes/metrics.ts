/**
 * GET /api/metrics — in-memory counters endpoint
 *
 * Protected by HTTP Basic Auth via METRICS_USER + METRICS_PASS env vars.
 * Returns JSON with uptime, counters, and timestamp.
 *
 * Not intended for Prometheus scraping — plain JSON for manual inspection
 * and lightweight uptime dashboards.
 *
 * Future path: swap counters for prom-client and emit Prometheus text format.
 */

import { Hono } from 'hono';
import { counters, startEpochMs } from '../counters.js';

export const metricsRoutes = new Hono();

// ---------------------------------------------------------------------------
// Basic auth helper
// ---------------------------------------------------------------------------

function isAuthorized(authHeader: string | undefined): boolean {
  const metricsUser = process.env.METRICS_USER;
  const metricsPass = process.env.METRICS_PASS;

  // If env vars are not configured, deny all access for safety
  if (!metricsUser || !metricsPass) return false;

  if (!authHeader || !authHeader.startsWith('Basic ')) return false;

  const encoded = authHeader.slice('Basic '.length);
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return false;
  }

  const colonIdx = decoded.indexOf(':');
  if (colonIdx < 0) return false;

  const user = decoded.slice(0, colonIdx);
  const pass = decoded.slice(colonIdx + 1);

  return user === metricsUser && pass === metricsPass;
}

// ---------------------------------------------------------------------------
// GET /metrics
// ---------------------------------------------------------------------------

metricsRoutes.get('/', (c) => {
  const authHeader = c.req.header('Authorization');

  if (!isAuthorized(authHeader)) {
    c.header('WWW-Authenticate', 'Basic realm="metrics"');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const uptime_seconds = Math.floor((Date.now() - startEpochMs) / 1000);

  return c.json({
    uptime_seconds,
    counters: { ...counters },
    timestamp: new Date().toISOString(),
  });
});
