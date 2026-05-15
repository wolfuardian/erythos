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
 *   Client sends the session cookie value as the HocusPocusProvider `token`
 *   option.  onAuthenticate reads `token` (not `requestHeaders`) so the
 *   client does NOT need to forward the raw Cookie header, which avoids CORS
 *   issues in browser-WS contexts.  Throw = reject (close code 4401).
 *
 * Scene visibility:
 *   onAuthenticate verifies the authenticated user can access the scene
 *   (owner OR visibility = 'public').  Anonymous / expired sessions → throw.
 */

import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db.js';
import { yjsDocuments, scenes } from '../db/schema.js';
import { resolveSessionByToken, SESSION_COOKIE } from '../auth.js';
import { logger } from '../middleware/logger.js';

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
    // -------------------------------------------------------------------
    // onAuthenticate
    // -------------------------------------------------------------------
    // Called on every new WebSocket connection before the client is
    // admitted into the document.
    //
    // `token` = the value passed as `token` in HocusPocusProvider on the
    //   client.  Client must send its session cookie value as the token.
    //   If token is empty, fall back to parsing the Cookie request header
    //   directly (useful for wscat / Postman testing without JS provider).
    // -------------------------------------------------------------------
    async onAuthenticate({ token, requestHeaders, documentName }) {
      // Resolve the plaintext session token to a user
      const rawToken =
        token ||
        parseCookieValue(requestHeaders.get('cookie'), SESSION_COOKIE);

      if (!rawToken) {
        logger.warn({ documentName }, 'realtime: onAuthenticate — no token');
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

      // Return user context so downstream hooks can identify the connection
      return { userId: user.id, githubLogin: user.github_login };
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
