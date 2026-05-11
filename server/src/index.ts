import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { authRoutes } from './routes/auth.js';
import { sceneRoutes } from './routes/scenes.js';
import { meRoutes } from './routes/me.js';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' }, 200);
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
api.route('/scenes', sceneRoutes);
api.route('/me', meRoutes);
app.route('/api', api);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

export default app;
