import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { authRoutes } from './routes/auth.js';
import { sceneRoutes } from './routes/scenes.js';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' }, 200);
});

const api = new Hono();
api.route('/auth', authRoutes);
api.route('/scenes', sceneRoutes);
app.route('/api', api);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

export default app;
