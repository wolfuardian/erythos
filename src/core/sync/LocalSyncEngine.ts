import { SceneDocument } from '../scene/SceneDocument';
import {
  type SceneId,
  type SceneVisibility,
  type SyncEngine,
  ConflictError,
  NotFoundError,
} from './SyncEngine';
import { generateUUID } from '../../utils/uuid';

const DB_VERSION = 3;
const STORE_NAME = 'scenes';

interface SceneRecord {
  id: SceneId;
  version: number;
  name: string;
  body: unknown; // serialized via SceneDocument.serialize()
  visibility: SceneVisibility;
  forkedFrom: SceneId | null;
}

function openDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // v1: create the object store
      if (oldVersion < 1) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }

      // v2: backfill visibility + forkedFrom on existing records
      if (oldVersion < 2) {
        const upgradeTx = (event.target as IDBOpenDBRequest).transaction!;
        const store = upgradeTx.objectStore(STORE_NAME);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;
          const record = cursor.value as SceneRecord;
          if (record.visibility === undefined) {
            record.visibility = 'private';
          }
          if (record.forkedFrom === undefined) {
            record.forkedFrom = null;
          }
          cursor.update(record);
          cursor.continue();
        };
      }

      // v3: backfill upAxis='Y' in body for any record missing it
      // SceneDocument.deserialize auto-migrates via v2→v3 chain on read, but
      // eagerly patching the stored JSON ensures corrupt-data detection works
      // even for direct indexedDB reads (e.g. cloud sync export tools).
      if (oldVersion < 3) {
        const upgradeTx = (event.target as IDBOpenDBRequest).transaction!;
        const store = upgradeTx.objectStore(STORE_NAME);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;
          const record = cursor.value as SceneRecord;
          if (
            typeof record.body === 'object' &&
            record.body !== null &&
            (record.body as Record<string, unknown>)['upAxis'] === undefined
          ) {
            (record.body as Record<string, unknown>)['upAxis'] = 'Y';
            cursor.update(record);
          }
          cursor.continue();
        };
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
 *
 * Schema versions:
 *   v1 — initial schema: id, version, name, body
 *   v2 — adds visibility ('private'|'public') and forkedFrom (SceneId|null);
 *        existing v1 records are backfilled with visibility='private', forkedFrom=null
 *   v3 — body.upAxis invariant: patches any existing record whose body lacks upAxis
 *        to add upAxis='Y' directly in the stored JSON body;
 *        subsequent reads via SceneDocument.deserialize also auto-migrate via the
 *        v2→v3 migration chain, so this eager patch is belt-and-suspenders.
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

  async fetch(id: SceneId): Promise<{
    body: SceneDocument;
    version: number;
    visibility: SceneVisibility;
    forkedFrom: SceneId | null;
  }> {
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
          resolve({
            body: doc,
            version: record.version,
            visibility: record.visibility ?? 'private',
            forkedFrom: record.forkedFrom ?? null,
          });
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
            visibility: record.visibility ?? 'private',
            forkedFrom: record.forkedFrom ?? null,
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
      visibility: 'private',
      forkedFrom: null,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      idbPut(store, record)
        .then(() => resolve({ id, version: 0 }))
        .catch(reject);
    });
  }

  async setVisibility(id: SceneId, visibility: SceneVisibility): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      idbGet(store, id)
        .then((record) => {
          if (!record) {
            reject(new NotFoundError(id));
            return;
          }
          // visibility is metadata — does not bump version
          const updated: SceneRecord = { ...record, visibility };
          idbPut(store, updated)
            .then(() => resolve())
            .catch(reject);
        })
        .catch(reject);
    });
  }

  async fork(
    id: SceneId,
    name?: string,
  ): Promise<{ id: SceneId; version: number; forkedFrom: SceneId }> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      idbGet(store, id)
        .then((source) => {
          if (!source) {
            reject(new NotFoundError(id));
            return;
          }
          const newId = generateUUID();
          const newName = name ?? `${source.name} (fork)`;
          const forked: SceneRecord = {
            id: newId,
            name: newName,
            version: 0,
            body: structuredClone(source.body), // defensive copy so the two rows are independent
            visibility: 'private', // forks always start private per spec
            forkedFrom: id,
          };
          idbPut(store, forked)
            .then(() => resolve({ id: newId, version: 0, forkedFrom: id }))
            .catch(reject);
        })
        .catch(reject);
    });
  }
}
