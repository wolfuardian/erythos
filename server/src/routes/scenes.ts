import { Hono } from 'hono';

export const sceneRoutes = new Hono();

// GET /scenes/:id — 501 Not Implemented (D4)
sceneRoutes.get('/:id', (c) => {
  return c.text('Not Implemented', 501);
});

// PUT /scenes/:id — 501 Not Implemented (D4)
sceneRoutes.put('/:id', (c) => {
  return c.text('Not Implemented', 501);
});

// POST /scenes — 501 Not Implemented (D4)
sceneRoutes.post('/', (c) => {
  return c.text('Not Implemented', 501);
});

// PATCH /scenes/:id/visibility — 501 Not Implemented (D4)
sceneRoutes.patch('/:id/visibility', (c) => {
  return c.text('Not Implemented', 501);
});

// POST /scenes/:id/fork — 501 Not Implemented (D4)
sceneRoutes.post('/:id/fork', (c) => {
  return c.text('Not Implemented', 501);
});
