import type { SceneDocument } from '../scene/SceneDocument';

// v0: plain string; no SceneId branded type found in src/utils/branded.ts
export type SceneId = string;

/**
 * Contract for cloud/local sync operations on scene documents.
 *
 * **Body reference semantics** (all three methods):
 * - Implementations MUST NOT mutate the `body` passed by callers.
 * - Callers MUST NOT mutate a `body` after passing it in (to `push` or `create`)
 *   or after receiving it from `fetch`. If the caller needs to continue using the
 *   body, it should work from a serialized snapshot rather than the live object.
 */
export type SceneVisibility = 'private' | 'public';

export interface SyncEngine {
  fetch(id: SceneId): Promise<{
    body: SceneDocument;
    version: number;
    visibility: SceneVisibility;
    forkedFrom: SceneId | null;
  }>;
  push(
    id: SceneId,
    body: SceneDocument,
    baseVersion: number,
  ): Promise<{ version: number }>;
  create(name: string, body: SceneDocument): Promise<{ id: SceneId; version: number }>;
  setVisibility(id: SceneId, visibility: SceneVisibility): Promise<void>;
  fork(
    id: SceneId,
    name?: string,
  ): Promise<{ id: SceneId; version: number; forkedFrom: SceneId }>;
}

export class NotFoundError extends Error {
  constructor(public sceneId: SceneId) {
    super(`Scene not found: ${sceneId}`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(
    public sceneId: SceneId,
    public currentVersion: number,
    public currentBody: SceneDocument,
  ) {
    super(`Conflict on scene ${sceneId}: current version ${currentVersion}`);
    this.name = 'ConflictError';
  }
}

/**
 * Server returned 428 Precondition Required (RFC 6585).
 *
 * Means the client omitted the `If-Match` header on a PUT. The client `push()`
 * always sets `If-Match`, so reaching this is a client bug — surface as a
 * named error so the caller can log / alert rather than swallow as generic.
 */
export class PreconditionRequiredError extends Error {
  constructor(public sceneId: SceneId) {
    super(`Precondition Required: If-Match header missing on scene ${sceneId}`);
    this.name = 'PreconditionRequiredError';
  }
}

/**
 * Server returned 413 Payload Too Large.
 *
 * The scene body exceeded the server's size limit (1 MB). The user must reduce
 * the scene size before pushing again.
 */
export class PayloadTooLargeError extends Error {
  constructor(public sceneId: SceneId) {
    super(`Payload too large on scene ${sceneId}: scene body exceeds server limit`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Server returned 412 Precondition Failed (RFC 7232).
 *
 * Means the `If-Match` header was malformed (wrong format, not a quoted ETag).
 * This is a client bug — the client always sets `If-Match: "${version}"` so
 * receiving this means the format logic is broken.
 */
export class PreconditionError extends Error {
  constructor(public sceneId: SceneId) {
    super(`Precondition Failed (412): malformed If-Match header on scene ${sceneId} — client bug`);
    this.name = 'PreconditionError';
  }
}

/**
 * HTTP 5xx server error.
 *
 * Transient failure — callers should retry once. If the second attempt also
 * fails, surface a user-visible error and preserve local state.
 */
export class ServerError extends Error {
  constructor(
    public readonly status: number,
    public sceneId: SceneId,
  ) {
    super(`Server error ${status} on scene ${sceneId}`);
    this.name = 'ServerError';
  }
}

/**
 * Network-level failure (fetch rejected — offline, DNS failure, etc.).
 *
 * Treated the same as ServerError for retry purposes: retry once, then
 * surface user-visible error and preserve local state.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}
