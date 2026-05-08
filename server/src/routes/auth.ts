import { Hono } from 'hono';

export const authRoutes = new Hono();

// GET /auth/me — returns 401 until real session handling is wired (D3)
authRoutes.get('/me', (c) => {
  return c.json({ error: 'Unauthorized' }, 401);
});

// GET /auth/github/start — 302 redirect placeholder (D3)
authRoutes.get('/github/start', (c) => {
  return c.redirect('/', 302);
});

// GET /auth/github/callback — not yet implemented (D3)
authRoutes.get('/github/callback', (c) => {
  return c.text('Not Implemented', 501);
});

// POST /auth/signout — stub returns 200 (D3)
authRoutes.post('/signout', (c) => {
  return c.json({ ok: true }, 200);
});
