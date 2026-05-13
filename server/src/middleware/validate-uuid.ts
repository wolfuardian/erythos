/**
 * Path-param UUID validation middleware.
 *
 * Postgres `uuid` columns reject non-UUID literals at the driver layer with
 * an exception. Without an up-front format check, routes that pass a bad
 * path param straight to a query (e.g. `/api/scenes/me`) surface that
 * exception as an opaque 500. This middleware short-circuits with a clean
 * 400 + error code before the handler runs.
 *
 * Error envelope follows the #1025 taxonomy seed:
 *   { error: "<human-readable>", code: "E#### ERR_…" }
 *
 * Codes used here:
 *   E1001 ERR_USER_ID_FORMAT
 *   E1002 ERR_SCENE_ID_FORMAT
 */

import type { Context, Next } from 'hono';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuidParam(
  paramName: string,
  errorCode: string,
  humanName: string,
) {
  return async (c: Context, next: Next) => {
    const value = c.req.param(paramName);
    if (!value || !UUID_RE.test(value)) {
      return c.json(
        {
          error: `Invalid ${humanName} format — expected UUID`,
          code: errorCode,
        },
        400,
      );
    }
    await next();
  };
}

/** Convenience: pre-built middleware for the common scene-id param. */
export const requireSceneIdUuid = requireUuidParam(
  'id',
  'E1002 ERR_SCENE_ID_FORMAT',
  'scene id',
);
