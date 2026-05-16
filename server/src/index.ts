import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { eq, sql } from 'drizzle-orm';
import { authRoutes } from './routes/auth.js';
import { sceneRoutes } from './routes/scenes.js';
import { shareTokenRoutes } from './routes/share-tokens.js';
import { assetRoutes } from './routes/assets.js';
import { meRoutes } from './routes/me.js';
import { metricsRoutes } from './routes/metrics.js';
import { magicLinkRoutes } from './routes/magic-link.js';
import { userRoutes } from './routes/users.js';
import { adminRoutes } from './routes/admin.js';
import { loggerMiddleware, logger } from './middleware/logger.js';
import { db } from './db.js';
import { users } from './db/schema.js';
import { recordAudit } from './audit/recordAudit.js';
import { createRealtimeServer } from './realtime/server.js';

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
//
// Mounted at BOTH `/health` (root — uptime monitor / install.md convention) and
// `/api/health` (alias — client useOfflineStatus pings this every 30 s; without
// the alias every prod client gets a 404 storm). Same handler, two routes.
// ---------------------------------------------------------------------------
const healthHandler = async (c: import('hono').Context) => {
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
};

app.get('/health', healthHandler);

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

api.get('/health', healthHandler);
api.route('/auth', authRoutes);
api.route('/auth/magic-link', magicLinkRoutes);
api.route('/scenes', sceneRoutes);
api.route('/scenes', shareTokenRoutes);
api.route('/assets', assetRoutes);
api.route('/me', meRoutes);
api.route('/metrics', metricsRoutes);
api.route('/users', userRoutes);
api.route('/admin', adminRoutes);
app.route('/api', api);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  logger.info(`Server listening on http://localhost:${port}`);

  // ---------------------------------------------------------------------------
  // Audit log retention — delete rows older than 90 days (refs PRIVACY.md §4)
  //
  // App-side tick instead of pg_cron to avoid installing extensions.
  // Runs once at boot, then every 24h. .unref() prevents the timer from
  // blocking clean process shutdown.
  // ---------------------------------------------------------------------------
  const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

  async function pruneAuditLog(): Promise<void> {
    try {
      await db.execute(
        sql`DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '90 days'`,
      );
    } catch (err) {
      logger.warn({ err }, 'audit retention: prune failed');
    }
  }

  void pruneAuditLog();
  setInterval(() => void pruneAuditLog(), RETENTION_INTERVAL_MS).unref();

  // ---------------------------------------------------------------------------
  // Scheduled account deletion — cascade hard-delete users past grace period
  //
  // G1 (refs #1095): DELETE /me sets scheduled_delete_at = now() + 30 days.
  // This job runs once at boot then every 24 h to cascade-delete rows where
  // scheduled_delete_at < now().
  //
  // On failure: silent warn (per OQ-3 — alerting deferred to O1 epic).
  // .unref() prevents the timer from blocking clean process shutdown.
  // ---------------------------------------------------------------------------

  async function pruneScheduledDeletes(): Promise<void> {
    try {
      // Fetch expired users before deleting so we can emit audit events.
      const expiredUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`${users.scheduled_delete_at} < now() AND ${users.scheduled_delete_at} IS NOT NULL`);

      if (expiredUsers.length === 0) return;

      for (const u of expiredUsers) {
        // Emit audit BEFORE deleting — actor_id FK is still valid pre-delete.
        // Fire-and-forget; audit failures do not block the cascade.
        void recordAudit('user.account_delete_executed', {
          actor_id: u.id,
          actor_ip: '',
          actor_ua: null,
          resource_type: 'user',
          resource_id: u.id,
          metadata: { reason: 'grace_period_expired' },
          success: true,
        });

        // Cascade delete: FK ON DELETE CASCADE removes sessions, scenes,
        // scene_versions, magic_link_tokens, scene_share_tokens, yjs_documents.
        await db.delete(users).where(eq(users.id, u.id));
      }
    } catch (err) {
      logger.warn({ err }, 'scheduled-delete prune: failed');
    }
  }

  void pruneScheduledDeletes();
  setInterval(() => void pruneScheduledDeletes(), RETENTION_INTERVAL_MS).unref();
});

// ---------------------------------------------------------------------------
// HocusPocus real-time server — runs on a dedicated port (refs #1064 L3-A)
//
// HocusPocus's Server class manages its own http.Server internally (via
// crossws / ws), so it cannot share the Hono http.Server.  A separate port
// keeps the servers decoupled without requiring a custom upgrade-event patch.
//
// Default: REALTIME_PORT = PORT + 1 (e.g. 3001 when PORT=3000).
// In production, Caddy reverse-proxies both:
//   https://erythos.app/api/*        → localhost:3000
//   wss://erythos.app/realtime/*     → localhost:3001
// ---------------------------------------------------------------------------
const realtimePort = Number(process.env.REALTIME_PORT ?? port + 1);

const realtimeServer = createRealtimeServer();
realtimeServer
  .listen(realtimePort)
  .then(() => {
    logger.info(`Realtime server listening on ws://localhost:${realtimePort}`);
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'Realtime server failed to start');
    process.exit(1);
  });

export default app;
