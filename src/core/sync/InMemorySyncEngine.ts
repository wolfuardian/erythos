import type { SceneDocument } from '../scene/SceneDocument';
import {
  type SceneId,
  type SceneVisibility,
  type SyncEngine,
  ConflictError,
  NotFoundError,
} from './SyncEngine';
import { generateUUID } from '../../utils/uuid';

interface SceneRecord {
  version: number;
  body: SceneDocument;
  name: string;
  visibility: SceneVisibility;
  forkedFrom: SceneId | null;
}

export class InMemorySyncEngine implements SyncEngine {
  private readonly store = new Map<SceneId, SceneRecord>();

  async fetch(id: SceneId): Promise<{
    body: SceneDocument;
    version: number;
    visibility: SceneVisibility;
    forkedFrom: SceneId | null;
  }> {
    const record = this.store.get(id);
    if (!record) throw new NotFoundError(id);
    return {
      body: record.body,
      version: record.version,
      visibility: record.visibility,
      forkedFrom: record.forkedFrom,
    };
  }

  async push(
    id: SceneId,
    body: SceneDocument,
    baseVersion: number,
  ): Promise<{ version: number }> {
    const record = this.store.get(id);
    if (!record) throw new NotFoundError(id);
    if (baseVersion !== record.version) {
      throw new ConflictError(id, record.version, record.body);
    }
    const newVersion = record.version + 1;
    this.store.set(id, { ...record, body, version: newVersion });
    return { version: newVersion };
  }

  async create(name: string, body: SceneDocument): Promise<{ id: SceneId; version: number }> {
    const id = generateUUID();
    this.store.set(id, {
      version: 0,
      body,
      name,
      visibility: 'private',
      forkedFrom: null,
    });
    return { id, version: 0 };
  }

  async setVisibility(id: SceneId, visibility: SceneVisibility): Promise<void> {
    const record = this.store.get(id);
    if (!record) throw new NotFoundError(id);
    // visibility is metadata — does not bump version
    this.store.set(id, { ...record, visibility });
  }

  async fork(
    id: SceneId,
    name?: string,
  ): Promise<{ id: SceneId; version: number; forkedFrom: SceneId }> {
    const source = this.store.get(id);
    if (!source) throw new NotFoundError(id);
    const newId = generateUUID();
    const newName = name ?? `${source.name} (fork)`;
    this.store.set(newId, {
      version: 0,
      body: source.body,
      name: newName,
      visibility: 'private', // forks always start private per spec
      forkedFrom: id,
    });
    return { id: newId, version: 0, forkedFrom: id };
  }
}
