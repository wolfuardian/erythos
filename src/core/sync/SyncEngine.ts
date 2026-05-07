import type { SceneDocument } from '../scene/SceneDocument';

// v0: plain string; no SceneId branded type found in src/utils/branded.ts
export type SceneId = string;

export interface SyncEngine {
  fetch(id: SceneId): Promise<{ body: SceneDocument; version: number }>;
  push(
    id: SceneId,
    body: SceneDocument,
    baseVersion: number,
  ): Promise<{ version: number }>;
  create(name: string, body: SceneDocument): Promise<{ id: SceneId; version: number }>;
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
