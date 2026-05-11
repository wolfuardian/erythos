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
