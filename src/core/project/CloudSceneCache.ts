/**
 * CloudSceneCache — IndexedDB cache for cloud scene blobs.
 *
 * Provides a cold-start fast-open cache for CloudProjectManager. This is
 * NOT the source of truth — the server is canonical. Stored bytes are used
 * only when the server is unreachable on initial load (G6 offline UX will
 * use this; for G2 it is a write-through performance layer).
 *
 * DB name : erythos-cloud-scene-cache
 * Store   : scenes
 * Key     : 'project-cache-' + sceneId (string, same format as spec)
 * Value   : { sceneId: string; data: string; version: number; cachedAt: number }
 *
 * Spec: docs/cloud-project-spec.md § Phase G2 — CloudProjectManager 實作
 */

const DB_NAME = 'erythos-cloud-scene-cache';
const STORE_NAME = 'scenes';
const DB_VERSION = 1;

export interface CacheEntry {
  /** Key as stored: 'project-cache-' + sceneId */
  key: string;
  /** Serialised scene JSON string */
  data: string;
  /** Server version number at time of cache write */
  version: number;
  /** Unix epoch ms */
  cachedAt: number;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return _dbPromise;
}

/** Derive the IDB key from a sceneId. */
function cacheKey(sceneId: string): string {
  return `project-cache-${sceneId}`;
}

/**
 * Read a cached scene for the given sceneId.
 * Returns null on cache miss.
 */
export async function getScene(sceneId: string): Promise<CacheEntry | null> {
  const db = await openDb();
  return new Promise<CacheEntry | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(cacheKey(sceneId));
    req.onsuccess = () => resolve((req.result as CacheEntry | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Write (or overwrite) a cached scene.
 */
export async function setScene(sceneId: string, data: string, version: number): Promise<void> {
  const db = await openDb();
  const entry: CacheEntry = {
    key: cacheKey(sceneId),
    data,
    version,
    cachedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete the cached scene for the given sceneId.
 * No-op if no entry exists.
 */
export async function deleteScene(sceneId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(cacheKey(sceneId));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
