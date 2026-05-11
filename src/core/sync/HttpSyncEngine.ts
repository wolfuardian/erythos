import { SceneDocument } from '../scene/SceneDocument';
import {
  type SceneId,
  type SceneVisibility,
  type SyncEngine,
  ConflictError,
  NotFoundError,
  PreconditionRequiredError,
} from './SyncEngine';
import { AuthError } from '../auth/AuthClient';
import { defaultBaseUrl } from './baseUrl';
import type { AssetSyncClient } from './asset/AssetSyncClient';
import type { ProjectManagerLike } from './asset/uploadSceneBinaries';
import { uploadSceneBinaries } from './asset/uploadSceneBinaries';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build standard JSON request headers.
 * Accepts an optional extra-headers record (e.g. If-Match for PUT).
 */
function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Wrap global fetch to:
 *   - always send `credentials: 'include'` (session cookie)
 *   - throw typed errors on non-2xx responses
 *
 * @param id        Scene id — used for error messages / ConflictError construction.
 * @param baseVersion  Only relevant for push (need it in ConflictError).
 * @param callerBody   Submitted body; used as fallback in 412 (client-bug) case.
 */
async function doFetch(
  url: string,
  init: RequestInit,
  id: SceneId,
  baseVersion?: number,
  callerBody?: SceneDocument,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'include' });
  } catch (err) {
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.ok) return res;

  switch (res.status) {
    case 404:
      throw new NotFoundError(id);

    case 401:
    case 403: {
      let msg = `HTTP ${res.status}`;
      try {
        const payload = await res.json() as { message?: string };
        if (typeof payload.message === 'string') msg = payload.message;
      } catch { /* ignore JSON parse error */ }
      throw new AuthError(msg);
    }

    case 409: {
      // Conflict: server has a newer version.
      // Response body: { current_version: number, current_body: ErythosJSON }
      const payload = await res.json() as {
        current_version: number;
        current_body: unknown;
      };
      const doc = new SceneDocument();
      doc.deserialize(payload.current_body);
      throw new ConflictError(id, payload.current_version, doc);
    }

    case 412: {
      // "If-Match format wrong" — this is a client bug, not a real conflict.
      // No current_version / current_body in response body.
      // Fall back to caller-supplied values so we always satisfy ConflictError constructor.
      // Note: caller should treat this as an unexpected client error (logged, telemetry).
      const fallbackVersion = baseVersion ?? 0;
      const fallbackBody = callerBody ?? new SceneDocument();
      throw new ConflictError(id, fallbackVersion, fallbackBody);
    }

    case 428:
      // "If-Match header missing" — push() always sets it, so this is a client bug.
      // Surface as a named error so callers can log / alert rather than swallow.
      throw new PreconditionRequiredError(id);

    default:
      if (res.status >= 500) {
        throw new Error(`Server error ${res.status} on scene ${id}`);
      }
      throw new Error(`Unexpected HTTP ${res.status} on scene ${id}`);
  }
}

// ── HttpSyncEngine ────────────────────────────────────────────────────────────

/**
 * Phase D fetch-based implementation of `SyncEngine`.
 *
 * Default base URL is resolved from the `VITE_SYNC_BASE_URL` env variable
 * (see `baseUrl.ts`).  Production falls back to `https://erythos.eoswolf.com`;
 * dev falls back to `http://localhost:3000`.  No explicit `baseUrl` is needed
 * in normal usage — pass one only in tests or custom deployments.
 *
 * Session auth: all requests include `credentials: 'include'` so the
 * browser sends the session cookie automatically.
 *
 * Spec reference: docs/sync-protocol.md §REST API (line 113+)
 */
export class HttpSyncEngine implements SyncEngine {
  private readonly baseUrl: string;

  /**
   * @param baseUrl        Base URL for the sync API.  Defaults to `defaultBaseUrl()`.
   * @param projectManager Optional local ProjectManager.  When provided together with
   *                       `assetClient`, all `project://` URLs in a pushed/created scene
   *                       are uploaded to the cloud and rewritten to `assets://` before
   *                       the scene body is sent to the server.
   *                       Pass `undefined` for anonymous / test mode (no uploads).
   * @param assetClient    Optional AssetSyncClient.  Must be paired with `projectManager`
   *                       to activate the pre-push binary upload hook.
   */
  constructor(
    baseUrl: string = defaultBaseUrl(),
    private readonly projectManager?: ProjectManagerLike,
    private readonly assetClient?: AssetSyncClient,
  ) {
    // Strip trailing slash for safe concatenation
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // ── fetch ──────────────────────────────────────────────────────────────────

  async fetch(id: SceneId): Promise<{
    body: SceneDocument;
    version: number;
    visibility: SceneVisibility;
    forkedFrom: SceneId | null;
  }> {
    const url = `${this.baseUrl}/scenes/${encodeURIComponent(id)}`;
    const res = await doFetch(url, { method: 'GET' }, id);

    const payload = await res.json() as {
      id: string;
      owner_id: string;
      name: string;
      version: number;
      body: unknown;
      visibility: SceneVisibility;
      forked_from: SceneId | null;
    };

    const doc = new SceneDocument();
    doc.deserialize(payload.body);

    return {
      body: doc,
      version: payload.version,
      visibility: payload.visibility,
      forkedFrom: payload.forked_from,
    };
  }

  // ── push ───────────────────────────────────────────────────────────────────

  async push(
    id: SceneId,
    body: SceneDocument,
    baseVersion: number,
  ): Promise<{ version: number }> {
    // Pre-push binary upload: walk scene for project:// URLs, upload to cloud,
    // rewrite to assets://, and get back a new SceneDocument for the server payload.
    // Skip if either projectManager or assetClient is absent (anonymous / test mode).
    if (this.projectManager && this.assetClient) {
      body = await uploadSceneBinaries(body, this.projectManager, this.assetClient);
    }

    const url = `${this.baseUrl}/scenes/${encodeURIComponent(id)}`;

    // If-Match must use RFC 7232 quoted form: "5"
    const res = await doFetch(
      url,
      {
        method: 'PUT',
        headers: jsonHeaders({ 'If-Match': `"${baseVersion}"` }),
        body: JSON.stringify(body.serialize()),
      },
      id,
      baseVersion,
      body,
    );

    const payload = await res.json() as { version: number };
    return { version: payload.version };
  }

  // ── create ─────────────────────────────────────────────────────────────────

  async create(
    name: string,
    body: SceneDocument,
  ): Promise<{ id: SceneId; version: number }> {
    // Pre-create binary upload: same hook as push() — upload project:// assets first.
    // Skip if either projectManager or assetClient is absent (anonymous / test mode).
    if (this.projectManager && this.assetClient) {
      body = await uploadSceneBinaries(body, this.projectManager, this.assetClient);
    }

    const url = `${this.baseUrl}/scenes`;

    const res = await doFetch(
      url,
      {
        method: 'POST',
        headers: jsonHeaders(),
        // POST /scenes wraps body in {name, body: <erythos JSON>}
        body: JSON.stringify({ name, body: body.serialize() }),
      },
      '' as SceneId, // no id yet; NotFoundError on create would be a server bug
    );

    const payload = await res.json() as { id: SceneId; version: number };
    return { id: payload.id, version: payload.version };
  }

  // ── setVisibility ──────────────────────────────────────────────────────────

  async setVisibility(id: SceneId, visibility: SceneVisibility): Promise<void> {
    const url = `${this.baseUrl}/scenes/${encodeURIComponent(id)}/visibility`;

    await doFetch(
      url,
      {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ visibility }),
      },
      id,
    );
    // 200 response body: {id, visibility} — we discard it; caller has the new value
  }

  // ── fork ───────────────────────────────────────────────────────────────────

  async fork(
    id: SceneId,
    name?: string,
  ): Promise<{ id: SceneId; version: number; forkedFrom: SceneId }> {
    const url = `${this.baseUrl}/scenes/${encodeURIComponent(id)}/fork`;

    const requestBody: { name?: string } = {};
    if (name !== undefined) requestBody.name = name;

    const res = await doFetch(
      url,
      {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(requestBody),
      },
      id,
    );

    const payload = await res.json() as {
      id: SceneId;
      version: number;
      forked_from: SceneId;
    };

    return {
      id: payload.id,
      version: payload.version,
      forkedFrom: payload.forked_from,
    };
  }
}
