import { SceneDocument } from '../scene/SceneDocument';
import {
  type SceneId,
  type SceneVisibility,
  type SyncEngine,
  ConflictError,
  NotFoundError,
} from './SyncEngine';
import { generateUUID } from '../../utils/uuid';

const DB_VERSION = 1;
const STORE_NAME = 'scenes';

interface SceneRecord {
  id: SceneId;
  version: number;
  name: string;
  body: unknown; // serialized via SceneDocument.serialize()
}

function openDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(store: IDBObjectStore, key: IDBValidKey): Promise<SceneRecord | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as SceneRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(store: IDBObjectStore, value: SceneRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * IndexedDB-backed SyncEngine. Stores scenes in a single object store keyed by SceneId.
 * DB name defaults to "erythos-sync"; pass a custom name in tests to keep each suite isolated.
 */
export class LocalSyncEngine implements SyncEngine {
  private readonly dbName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(dbName = 'erythos-sync') {
    this.dbName = dbName;
  }

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(this.dbName);
    }
    return this.dbPromise;
  }

  async fetch(id: SceneId): Promise<{ body: SceneDocument; version: number }> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      idbGet(store, id)
        .then((record) => {
          if (!record) {
            reject(new NotFoundError(id));
            return;
          }
          const doc = new SceneDocument();
          doc.deserialize(record.body);
          resolve({ body: doc, version: record.version });
        })
        .catch(reject);
    });
  }

  async push(
    id: SceneId,
    body: SceneDocument,
    baseVersion: number,
  ): Promise<{ version: number }> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // read → version-check → write in single readwrite transaction
      idbGet(store, id)
        .then((record) => {
          if (!record) {
            reject(new NotFoundError(id));
            return;
          }
          if (record.version !== baseVersion) {
            const currentDoc = new SceneDocument();
            currentDoc.deserialize(structuredClone(record.body));
            reject(new ConflictError(id, record.version, currentDoc));
            return;
          }
          const newVersion = record.version + 1;
          const updated: SceneRecord = {
            id: record.id,
            name: record.name,
            version: newVersion,
            body: body.serialize(),
          };
          idbPut(store, updated)
            .then(() => resolve({ version: newVersion }))
            .catch(reject);
        })
        .catch(reject);
    });
  }

  async create(name: string, body: SceneDocument): Promise<{ id: SceneId; version: number }> {
    const db = await this.getDB();
    const id = generateUUID();
    const record: SceneRecord = {
      id,
      name,
      version: 0,
      body: body.serialize(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      idbPut(store, record)
        .then(() => resolve({ id, version: 0 }))
        .catch(reject);
    });
  }

  // Stub — implemented in feat/share-link-engine PR
  async setVisibility(_id: SceneId, _visibility: SceneVisibility): Promise<void> {
    throw new Error('setVisibility not implemented');
  }

  // Stub — implemented in feat/share-link-engine PR
  async fork(
    _id: SceneId,
    _name?: string,
  ): Promise<{ id: SceneId; version: number; forkedFrom: SceneId }> {
    throw new Error('fork not implemented');
  }
}
