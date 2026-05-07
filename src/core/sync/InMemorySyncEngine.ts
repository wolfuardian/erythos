import type { SceneDocument } from '../scene/SceneDocument';
import { type SceneId, type SyncEngine, ConflictError, NotFoundError } from './SyncEngine';

interface SceneRecord {
  version: number;
  body: SceneDocument;
  name: string;
}

export class InMemorySyncEngine implements SyncEngine {
  private readonly store = new Map<SceneId, SceneRecord>();

  async fetch(id: SceneId): Promise<{ body: SceneDocument; version: number }> {
    const record = this.store.get(id);
    if (!record) throw new NotFoundError(id);
    return { body: record.body, version: record.version };
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
    const id = crypto.randomUUID();
    this.store.set(id, { version: 0, body, name });
    return { id, version: 0 };
  }
}
