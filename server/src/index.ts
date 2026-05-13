import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { authRoutes } from './routes/auth.js';
import { sceneRoutes } from './routes/scenes.js';
import { shareTokenRoutes } from './routes/share-tokens.js';
import { assetRoutes } from './routes/assets.js';
import { meRoutes } from './routes/me.js';
import { metricsRoutes } from './routes/metrics.js';
import { magicLinkRoutes } from './routes/magic-link.js';
import { loggerMiddleware, logger } from './middleware/logger.js';
import { db } from './db.js';

const app = new Hono();

// ---------------------------------------------------------------------------
// Global structured logger — applied before all routes
// ---------------------------------------------------------------------------
app.use('*', loggerMiddleware);

// ---------------------------------------------------------------------------
// Global error handler — catches unhandled errors, logs stack, hides from client
// ---------------------------------------------------------------------------
app.onError((err, c) => {
  logger.error({ err, method: c.req.method, path: c.req.path }, 'Unhandled error');
  return c.json({ error: 'Internal error' }, 500);
});

// ---------------------------------------------------------------------------
// Process-level error sinks (v0 — log to stderr; v0.1 add Sentry/GlitchTip)
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
  // Give pino a moment to flush before exiting
  setTimeout(() => process.exit(1), 500);
});

// ---------------------------------------------------------------------------
// Health endpoint — DB connectivity check, no auth required (uptime monitor)
// ---------------------------------------------------------------------------
app.get('/health', async (c) => {
  const t0 = Date.now();
  let dbStatus: 'up' | 'down' = 'down';

  try {
    // Abort if DB takes more than 1 second
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB health check timeout')), 1000),
    );
    await Promise.race([db.execute(sql`SELECT 1`), timeout]);
    dbStatus = 'up';
  } catch (err) {
    logger.warn({ err }, 'health check: db unreachable');
  }

  const response_ms = Date.now() - t0;
  const status = dbStatus === 'up' ? 'ok' : 'degraded';

  // Always 200 — uptime monitors read body to detect degraded state
  return c.json({ status, db: dbStatus, response_ms }, 200);
});

// ---------------------------------------------------------------------------
// Origin validation middleware — defense-in-depth against subdomain-compromise
// lateral CSRF. If *.eoswolf.com is ever hijacked, a forged cross-origin POST
// would carry a different Origin and be rejected here before reaching any route.
//
// ALLOWED_ORIGIN supports comma-separated values for multi-origin setups:
//   dev:  ALLOWED_ORIGIN=http://localhost:5173,http://localhost:4173
//   prod: ALLOWED_ORIGIN=https://erythos.eoswolf.com
//
// GET requests are exempt — SameSite=Lax cookies already block GET-based CSRF,
// and many read endpoints must work without a browser Origin header (e.g. curl).
// ---------------------------------------------------------------------------
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
);

const api = new Hono();

api.use('*', async (c, next) => {
  if (STATE_CHANGING_METHODS.has(c.req.method)) {
    const origin = c.req.header('Origin');
    if (!origin || !allowedOrigins.has(origin)) {
      return c.json({ error: 'Origin not allowed' }, 403);
    }
  }
  return next();
});

api.route('/auth', authRoutes);
api.route('/auth/magic-link', magicLinkRoutes);
api.route('/scenes', sceneRoutes);
api.route('/scenes', shareTokenRoutes);
api.route('/assets', assetRoutes);
api.route('/me', meRoutes);
api.route('/metrics', metricsRoutes);
app.route('/api', api);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  logger.info(`Server listening on http://localhost:${port}`);
});

export default app;
