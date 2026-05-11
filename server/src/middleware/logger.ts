/**
 * Pino structured logger middleware for Hono.
 *
 * - Logs each request: method, path, status, duration_ms, userId (if authed)
 * - prod: JSON lines to stdout
 * - dev:  pino-pretty coloured output
 *
 * Also increments req_total counter for /metrics.
 */

import pino from 'pino';
import type { Context, Next } from 'hono';
import { incReqTotal } from '../counters.js';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino(
  isDev
    ? {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : { level: 'info' },
);

export async function loggerMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();

  try {
    await next();
  } finally {
    const duration_ms = Date.now() - start;
    const status = c.res.status;

    incReqTotal(status);

    // Extract userId from set variables if auth middleware ran
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (c as any).get?.('user') as { id?: string } | undefined;
    const userId = user?.id;

    const logObj: Record<string, unknown> = {
      method: c.req.method,
      path: c.req.path,
      status,
      duration_ms,
    };
    if (userId) logObj['userId'] = userId;

    if (status >= 500) {
      logger.error(logObj);
    } else if (status >= 400) {
      logger.warn(logObj);
    } else {
      logger.info(logObj);
    }
  }
}
