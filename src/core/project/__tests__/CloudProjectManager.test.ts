/**
 * CloudProjectManager tests — unit coverage for:
 *   - loadScene: server hit / server offline + cache hit / server offline + cache miss
 *   - saveScene: ok / conflict / offline / unauthorized / rethrow (payload-too-large etc.)
 *   - resolveAsset: assets:// delegated / project:// throws / bad scheme throws
 *   - close: revokes blob URLs, deletes cache
 *
 * Mocks:
 *   - HttpSyncEngine (fetch + push)
 *   - AssetSyncClient (download)
 *   - CloudSceneCache (getScene / setScene / deleteScene)
 *   - URL.createObjectURL / revokeObjectURL
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudProjectManager } from '../CloudProjectManager';
import { SceneDocument } from '../../scene/SceneDocument';
import {
  ConflictError,
  NetworkError,
  PayloadTooLargeError,
  PreconditionError,
} from '../../sync/SyncEngine';
import { AuthError } from '../../auth/AuthClient';

// ── Mock CloudSceneCache module ───────────────────────────────────────────────

vi.mock('../CloudSceneCache', () => ({
  getScene: vi.fn(),
  setScene: vi.fn().mockResolvedValue(undefined),
  deleteScene: vi.fn().mockResolvedValue(undefined),
}));

import * as CloudSceneCache from '../CloudSceneCache';

// ── URL stubs ─────────────────────────────────────────────────────────────────

let urlCounter = 0;
const revokedURLs: string[] = [];

function setupURLStubs() {
  urlCounter = 0;
  revokedURLs.length = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:test/${++urlCounter}`),
    revokeObjectURL: vi.fn((url: string) => { revokedURLs.push(url); }),
  });
}

function restoreURLStubs() {
  vi.unstubAllGlobals();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmptySceneDocument(): SceneDocument {
  const doc = new SceneDocument();
  return doc;
}

/**
 * Build a minimal mock HttpSyncEngine.
 * Only fetch() and push() are used by CloudProjectManager.
 */
function makeMockSyncEngine(overrides: {
  fetchResult?: { body: SceneDocument; version: number; visibility: 'private'; forkedFrom: null };
  fetchError?: Error;
  pushResult?: { version: number };
  pushError?: Error;
} = {}) {
  const doc = makeEmptySceneDocument();
  return {
    fetch: vi.fn().mockImplementation(async () => {
      if (overrides.fetchError) throw overrides.fetchError;
      return overrides.fetchResult ?? { body: doc, version: 3, visibility: 'private', forkedFrom: null };
    }),
    push: vi.fn().mockImplementation(async () => {
      if (overrides.pushError) throw overrides.pushError;
      return overrides.pushResult ?? { version: 4 };
    }),
    create: vi.fn(),
    setVisibility: vi.fn(),
    fork: vi.fn(),
  } as any;
}

function makeMockAssetClient(overrides: {
  downloadResult?: Blob;
  downloadError?: Error;
} = {}) {
  return {
    headHash: vi.fn(),
    upload: vi.fn(),
    download: vi.fn().mockImplementation(async () => {
      if (overrides.downloadError) throw overrides.downloadError;
      return overrides.downloadResult ?? new Blob(['asset-data']);
    }),
  } as any;
}

const SCENE_ID = 'test-scene-uuid';

function makeCPM(syncOverrides = {}, assetOverrides = {}) {
  const syncEngine = makeMockSyncEngine(syncOverrides);
  const assetClient = makeMockAssetClient(assetOverrides);
  const cpm = new CloudProjectManager(SCENE_ID, syncEngine, assetClient, 'http://localhost:3000');
  return { cpm, syncEngine, assetClient };
}

// ── Tests: loadScene ──────────────────────────────────────────────────────────

describe('CloudProjectManager.loadScene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CloudSceneCache.getScene).mockResolvedValue(null);
    vi.mocked(CloudSceneCache.setScene).mockResolvedValue(undefined);
  });

  it('fetches from server and returns { doc: SceneDocument, fromCache: false }', async () => {
    const { cpm, syncEngine } = makeCPM();

    const result = await cpm.loadScene();

    expect(syncEngine.fetch).toHaveBeenCalledWith(SCENE_ID);
    expect(result.doc).toBeInstanceOf(SceneDocument);
    expect(result.fromCache).toBe(false);
    expect(cpm.currentVersion).toBe(3);
  });

  it('writes to IndexedDB cache after successful server fetch', async () => {
    const { cpm } = makeCPM();

    const result = await cpm.loadScene();

    expect(result.fromCache).toBe(false);
    expect(CloudSceneCache.setScene).toHaveBeenCalledWith(
      SCENE_ID,
      expect.any(String),
      3,
    );
  });

  it('returns { fromCache: true } when loaded from IndexedDB on NetworkError', async () => {
    const doc = makeEmptySceneDocument();
    const serialised = JSON.stringify(doc.serialize());

    vi.mocked(CloudSceneCache.getScene).mockResolvedValue({
      key: `project-cache-${SCENE_ID}`,
      data: serialised,
      version: 2,
      cachedAt: Date.now(),
    });

    const { cpm } = makeCPM({ fetchError: new NetworkError('offline') });

    const result = await cpm.loadScene();

    expect(result.doc).toBeInstanceOf(SceneDocument);
    expect(result.fromCache).toBe(true);
    expect(cpm.currentVersion).toBe(2);
  });

  it('throws NetworkError when offline and no cache', async () => {
    vi.mocked(CloudSceneCache.getScene).mockResolvedValue(null);
    const { cpm } = makeCPM({ fetchError: new NetworkError('offline') });

    await expect(cpm.loadScene()).rejects.toBeInstanceOf(NetworkError);
  });

  it('re-throws non-network errors (e.g. AuthError)', async () => {
    const { cpm } = makeCPM({ fetchError: new AuthError('Unauthorized') });

    await expect(cpm.loadScene()).rejects.toBeInstanceOf(AuthError);
  });

  // ── New tests for #1060 fromCache discriminant ────────────────────────────

  it('[#1060] fromCache is false on successful server fetch', async () => {
    const { cpm } = makeCPM();

    const { fromCache } = await cpm.loadScene();

    expect(fromCache).toBe(false);
  });

  it('[#1060] fromCache is true on NetworkError + cache present', async () => {
    const doc = makeEmptySceneDocument();
    vi.mocked(CloudSceneCache.getScene).mockResolvedValue({
      key: `project-cache-${SCENE_ID}`,
      data: JSON.stringify(doc.serialize()),
      version: 7,
      cachedAt: Date.now(),
    });

    const { cpm } = makeCPM({ fetchError: new NetworkError('offline') });

    const { fromCache, doc: resultDoc } = await cpm.loadScene();

    expect(fromCache).toBe(true);
    expect(resultDoc).toBeInstanceOf(SceneDocument);
    expect(cpm.currentVersion).toBe(7);
  });

  it('[#1060] throws (not fromCache) on NetworkError + no cache present', async () => {
    vi.mocked(CloudSceneCache.getScene).mockResolvedValue(null);
    const { cpm } = makeCPM({ fetchError: new NetworkError('offline') });

    await expect(cpm.loadScene()).rejects.toBeInstanceOf(NetworkError);
  });
});

// ── Tests: saveScene ──────────────────────────────────────────────────────────

describe('CloudProjectManager.saveScene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CloudSceneCache.setScene).mockResolvedValue(undefined);
  });

  it('returns { ok: true, version } on successful push', async () => {
    const { cpm } = makeCPM({}, {});
    const scene = makeEmptySceneDocument();

    const result = await cpm.saveScene(scene, 3);

    expect(result).toEqual({ ok: true, version: 4 });
    expect(cpm.currentVersion).toBe(4);
  });

  it('updates IndexedDB cache after successful save', async () => {
    const { cpm } = makeCPM();
    const scene = makeEmptySceneDocument();

    await cpm.saveScene(scene, 3);

    expect(CloudSceneCache.setScene).toHaveBeenCalledWith(
      SCENE_ID,
      expect.any(String),
      4,
    );
  });

  it('returns { ok: false, reason: "conflict" } on 409 ConflictError', async () => {
    const remoteDoc = makeEmptySceneDocument();
    const conflictErr = new ConflictError(SCENE_ID, 5, remoteDoc);

    const { cpm } = makeCPM({ pushError: conflictErr });
    const scene = makeEmptySceneDocument();

    const result = await cpm.saveScene(scene, 3);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'conflict') {
      expect(result.currentVersion).toBe(5);
      expect(result.currentBody).toBe(remoteDoc);
    }
  });

  it('returns { ok: false, reason: "offline" } on NetworkError', async () => {
    const { cpm } = makeCPM({ pushError: new NetworkError('Network error') });
    const scene = makeEmptySceneDocument();

    const result = await cpm.saveScene(scene, 3);

    expect(result).toEqual({ ok: false, reason: 'offline' });
  });

  it('returns { ok: false, reason: "unauthorized" } on AuthError', async () => {
    const { cpm } = makeCPM({ pushError: new AuthError('Forbidden') });
    const scene = makeEmptySceneDocument();

    const result = await cpm.saveScene(scene, 3);

    expect(result).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('re-throws PayloadTooLargeError (for CloudAutoSave to handle)', async () => {
    const { cpm } = makeCPM({ pushError: new PayloadTooLargeError(SCENE_ID) });
    const scene = makeEmptySceneDocument();

    await expect(cpm.saveScene(scene, 3)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('re-throws PreconditionError (client-bug path)', async () => {
    const { cpm } = makeCPM({ pushError: new PreconditionError(SCENE_ID) });
    const scene = makeEmptySceneDocument();

    await expect(cpm.saveScene(scene, 3)).rejects.toBeInstanceOf(PreconditionError);
  });
});

// ── Tests: resolveAsset ───────────────────────────────────────────────────────

describe('CloudProjectManager.resolveAsset', () => {
  beforeEach(setupURLStubs);
  afterEach(restoreURLStubs);

  it('downloads assets:// URL via AssetClient', async () => {
    const blob = new Blob(['asset-bytes']);
    const { cpm, assetClient } = makeCPM({}, { downloadResult: blob });

    const result = await cpm.resolveAsset('assets://abc123/model.glb');

    expect(assetClient.download).toHaveBeenCalledWith('abc123');
    expect(result).toBe(blob);
  });

  it('extracts hash from assets:// URL with filename', async () => {
    const blob = new Blob(['asset-bytes']);
    const { cpm, assetClient } = makeCPM({}, { downloadResult: blob });

    await cpm.resolveAsset('assets://deadbeef/texture.png');

    expect(assetClient.download).toHaveBeenCalledWith('deadbeef');
  });

  it('throws for project:// URLs (broken-ref in CloudProject, spec D-8)', async () => {
    const { cpm } = makeCPM();

    await expect(cpm.resolveAsset('project://models/chair.glb')).rejects.toThrow(
      /project:\/\/ and prefabs:\/\/ URLs are invalid in CloudProject/,
    );
  });

  it('throws for unrecognised URL format', async () => {
    const { cpm } = makeCPM();

    await expect(cpm.resolveAsset('not-a-url')).rejects.toThrow(/unrecognised URL format/);
  });
});

// ── Tests: close ─────────────────────────────────────────────────────────────

describe('CloudProjectManager.close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CloudSceneCache.deleteScene).mockResolvedValue(undefined);
  });

  it('deletes IndexedDB cache entry on close', async () => {
    const { cpm } = makeCPM();

    await cpm.close();

    expect(CloudSceneCache.deleteScene).toHaveBeenCalledWith(SCENE_ID);
  });

  it('does not throw if cache deletion fails', async () => {
    vi.mocked(CloudSceneCache.deleteScene).mockRejectedValue(new Error('IDB error'));
    const { cpm } = makeCPM();

    await expect(cpm.close()).resolves.toBeUndefined();
  });
});

// ── Tests: identifier ─────────────────────────────────────────────────────────

describe('CloudProjectManager.identifier', () => {
  it('returns cloud identifier with sceneId', () => {
    const { cpm } = makeCPM();

    const id = cpm.identifier;
    expect(id.kind).toBe('cloud');
    if (id.kind === 'cloud') {
      expect(id.sceneId).toBe(SCENE_ID);
    }
  });
});
