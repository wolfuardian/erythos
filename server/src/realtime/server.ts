/**
 * HocusPocus real-time server — L3-A infra (refs #1064)
 *
 * Architecture:
 *   - Runs on a dedicated port (REALTIME_PORT, default REST_PORT+1) because
 *     HocusPocus's Server class manages its own http.Server internally.
 *   - Clients connect via:  wss://erythos.app/realtime/<sceneId>
 *     HocusPocus maps the path suffix to `documentName` automatically.
 *   - L3-A: Y.Doc is empty (awareness-transport only; no CRDT scene writes).
 *   - Persistence: @hocuspocus/extension-database — full-snapshot model in
 *     yjs_documents table.  L3-B will migrate to append-only yjs_updates.
 *
 * Auth:
 *   Primary path (L3-A2 browser client): HocusPocusProvider `token: null`,
 *   browser auto-attaches the session cookie on the WS upgrade handshake,
 *   server reads it via parseCookieValue on the Cookie request header.
 *   Fallback path (wscat / Postman / non-browser): pass the session token
 *   string directly as `token`.  Throw = reject (close code 4401, auto-emitted
 *   by HocusPocus — not our choice of convention).
 *
 * Scene visibility:
 *   onAuthenticate verifies the authenticated user can access the scene
 *   (owner OR visibility = 'public').  Anonymous / expired sessions → throw.
 *
 * Stale session disconnect (L3-A4):
 *   onAuthenticate handles the initial "no token / invalid token → reject" case.
 *   For already-connected clients whose session expires mid-session, we use the
 *   `connected` hook to set a per-connection interval that re-validates the
 *   session token every STALE_SESSION_CHECK_INTERVAL_MS (60s default).
 *   If the session is no longer valid, the connection is closed immediately.
 *   The interval is cleaned up via `onDisconnect`.
 *
 *   Spec: docs/realtime-co-edit-spec.md § L3-A scope
 *   Issue: #1067 (L3-A4)
 */

import { Server } from '@hocuspocus/server';
import type { connectedPayload, onDisconnectPayload } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db.js';
import { yjsDocuments, scenes } from '../db/schema.js';
import { resolveSessionByToken, SESSION_COOKIE } from '../auth.js';
import { logger } from '../middleware/logger.js';

// ---------------------------------------------------------------------------
// Stale session disconnect constants
// ---------------------------------------------------------------------------

/**
 * Interval (ms) between session re-validation checks for connected clients.
 * Spec does not specify a value; 60s is a conservative default that catches
 * expired sessions within a minute without hammering the DB.
 * Refs: docs/realtime-co-edit-spec.md § L3-A scope; Issue #1067 (L3-A4)
 */
const STALE_SESSION_CHECK_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Cookie parsing helper
// ---------------------------------------------------------------------------

/**
 * Parse a `Cookie:` header string and return the value for `name`.
 * Falls back to null when the cookie is absent.
 */
function parseCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() === name) {
      return trimmed.slice(eq + 1).trim();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HocusPocus server factory
// ---------------------------------------------------------------------------

export function createRealtimeServer() {
  return new Server({
    // Suppress HocusPocus default verbose console logging; we use pino via logger.
    quiet: true,

    // -------------------------------------------------------------------
    // onAuthenticate
    // -------------------------------------------------------------------
    // Called on every new WebSocket connection before the client is
    // admitted into the document.
    //
    // `token` = the value passed as `token` in HocusPocusProvider on the
    //   client.  Primary path (L3-A2 browser client): `token: null` so the
    //   browser auto-attaches the session cookie on the WS upgrade handshake;
    //   server reads it via parseCookieValue on the Cookie request header.
    //   Fallback path (wscat / Postman / non-browser): pass the session token
    //   string directly as `token`.
    // -------------------------------------------------------------------
    async onAuthenticate({ token, requestHeaders, documentName }) {
      // Resolve the plaintext session token to a user
      const rawToken =
        token ||
        parseCookieValue(requestHeaders.get('cookie'), SESSION_COOKIE);

      if (!rawToken) {
        logger.warn({ documentName }, 'realtime: onAuthenticate — no token');
        // HocusPocus auto-emits close code 4401 on thrown error here — not our convention.
        throw new Error('Unauthorized: missing session token');
      }

      const user = await resolveSessionByToken(rawToken);
      if (!user) {
        logger.warn({ documentName }, 'realtime: onAuthenticate — invalid/expired session');
        throw new Error('Unauthorized: invalid or expired session');
      }

      // documentName = scene UUID (path after the WS root, e.g. "abc-123")
      const sceneId = documentName;

      // Verify user can access the scene: must be owner OR scene is public
      const sceneRows = await db
        .select({ owner_id: scenes.owner_id, visibility: scenes.visibility })
        .from(scenes)
        .where(eq(scenes.id, sceneId))
        .limit(1);

      const scene = sceneRows[0];

      if (!scene) {
        logger.warn({ documentName, userId: user.id }, 'realtime: onAuthenticate — scene not found');
        throw new Error('Not Found: scene does not exist');
      }

      const canAccess = scene.owner_id === user.id || scene.visibility === 'public';
      if (!canAccess) {
        logger.warn({ documentName, userId: user.id }, 'realtime: onAuthenticate — access denied');
        throw new Error('Forbidden: no access to this scene');
      }

      logger.info({ documentName, userId: user.id }, 'realtime: onAuthenticate — OK');

      // Return user context so downstream hooks (connected, onDisconnect)
      // can identify the connection and re-validate the session.
      // rawToken is stored for periodic stale-session check (L3-A4).
      return { userId: user.id, githubLogin: user.github_login, rawToken };
    },

    // -------------------------------------------------------------------
    // Stale session disconnect (L3-A4)
    // -------------------------------------------------------------------
    // `connected` fires after the full auth handshake succeeds.
    // We set a per-connection interval to re-validate the session token.
    // If the token is no longer valid (session expired or revoked), we
    // close the connection immediately.
    //
    // The interval ID is stored in the connection context so `onDisconnect`
    // can clear it without leaking timers.
    //
    // Context shape from onAuthenticate:
    //   { userId, githubLogin, rawToken, _staleCheckInterval? }
    async connected({ context, connection, documentName }: connectedPayload) {
      const ctx = context as { userId: string; rawToken: string; _staleCheckInterval?: ReturnType<typeof setInterval> };

      const intervalId = setInterval(async () => {
        const user = await resolveSessionByToken(ctx.rawToken).catch(() => null);
        if (!user) {
          logger.warn(
            { documentName, userId: ctx.userId },
            'realtime: stale session detected — closing connection',
          );
          connection.close();
        }
      }, STALE_SESSION_CHECK_INTERVAL_MS);

      // Store interval ID in context for cleanup on disconnect
      ctx._staleCheckInterval = intervalId;
    },

    // -------------------------------------------------------------------
    // Stale session cleanup (L3-A4)
    // -------------------------------------------------------------------
    // Clear the per-connection stale-check interval when the client
    // disconnects (normal or abnormal).  Prevents timer leaks.
    async onDisconnect({ context }: onDisconnectPayload) {
      const ctx = context as { _staleCheckInterval?: ReturnType<typeof setInterval> };
      if (ctx._staleCheckInterval !== undefined) {
        clearInterval(ctx._staleCheckInterval);
        ctx._staleCheckInterval = undefined;
      }
    },

    // -------------------------------------------------------------------
    // Persistence via @hocuspocus/extension-database
    // -------------------------------------------------------------------
    extensions: [
      new Database({
        /**
         * fetch — called when a document is first loaded.
         * Return the stored Y.Doc state snapshot, or null for new docs.
         *
         * L3-A note: Y.Doc is effectively empty (presence-only).
         * The snapshot table is created here for forward-compatibility
         * with L3-B, which will store CRDT updates.
         */
        async fetch({ documentName }) {
          const rows = await db
            .select({ state: yjsDocuments.state })
            .from(yjsDocuments)
            .where(eq(yjsDocuments.name, documentName))
            .limit(1);

          const row = rows[0];
          if (!row) return null;

          // Convert Buffer → Uint8Array (drizzle returns Buffer for bytea)
          return new Uint8Array(row.state);
        },

        /**
         * store — called by HocusPocus after debounce when the document
         * has been modified.  Upserts the full Y.Doc state snapshot.
         *
         * `state` is a Buffer (Uint8Array-compatible).
         */
        async store({ documentName, state }) {
          // Use raw pool for an UPSERT that sets updated_at correctly.
          // drizzle does not yet expose a portable ON CONFLICT DO UPDATE
          // with computed columns, so we fall back to pg directly here.
          await pool.query(
            `INSERT INTO yjs_documents (name, state, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (name) DO UPDATE
               SET state = EXCLUDED.state,
                   updated_at = now()`,
            [documentName, state],
          );
        },
      }),
    ],
  });
}
