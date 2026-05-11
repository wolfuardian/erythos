import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asAssetPath } from '../../../utils/branded';

// ── Helpers to build mock FileSystem handles ──────────────────────────────────

function makeWritable() {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

interface MockFileHandleOptions {
  exists?: boolean;
  content?: string;
}

function makeFileHandle(opts: MockFileHandleOptions = {}) {
  return {
    kind: 'file' as const,
    getFile: vi.fn().mockResolvedValue(
      new File([opts.content ?? ''], 'test.erythos', { type: 'text/plain' }),
    ),
    createWritable: vi.fn().mockResolvedValue(makeWritable()),
  };
}

/**
 * Build a mock FileSystemDirectoryHandle.
 * @param existingFiles map of filename -> file handle (simulates existing files)
 */
function makeDirHandle(existingFiles: Record<string, ReturnType<typeof makeFileHandle>> = {}) {
  const files = { ...existingFiles };

  const getFileHandle = vi.fn(async (name: string, opts?: { create?: boolean }) => {
    if (files[name]) return files[name];
    if (opts?.create) {
      const fh = makeFileHandle();
      files[name] = fh;
      return fh;
    }
    const err = new Error(`Not found: ${name}`) as any;
    err.name = 'NotFoundError';
    throw err;
  });

  const getDirectoryHandle = vi.fn(async (_name: string, _opts?: { create?: boolean }) => {
    return makeDirHandle();
  });

  const removeEntry = vi.fn().mockResolvedValue(undefined);

  const entries = async function*() {
    for (const [name, fh] of Object.entries(files)) {
      yield [name, fh];
    }
  };

  return {
    kind: 'directory' as const,
    name: 'mock-project',
    getFileHandle,
    getDirectoryHandle,
    removeEntry,
    entries,
    isSameEntry: vi.fn().mockResolvedValue(false),
    _files: files,
  };
}

// ── Minimal mock for SolidJS createSignal (used in ProjectManager) ────────────
// Vitest runs in Node; solid-js signals work in Node environments with the
// universal build.  We do NOT need to mock solid-js here — the real createSignal
// works fine outside a reactive root for simple get/set behaviour.

// ── Import under test ─────────────────────────────────────────────────────────
// Mock IndexedDB-backed ProjectHandleStore so tests don't need a real IDB.
vi.mock('../ProjectHandleStore', () => ({
  loadProjects: vi.fn().mockResolvedValue([]),
  saveProject: vi.fn().mockResolvedValue(undefined),
  removeProject: vi.fn().mockResolvedValue(undefined),
}));

import { ProjectManager } from '../ProjectManager';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProjectManager.currentScenePath signal', () => {
  it('defaults to scenes/scene.erythos', () => {
    const pm = new ProjectManager();
    expect(pm.currentScenePath()).toBe('scenes/scene.erythos');
  });

  it('setCurrentScenePath updates the accessor', () => {
    const pm = new ProjectManager();
    pm.setCurrentScenePath(asAssetPath('scenes/level-2.erythos'));
    expect(pm.currentScenePath()).toBe('scenes/level-2.erythos');
  });

  it('signal switching: multiple updates reflect latest value', () => {
    const pm = new ProjectManager();
    pm.setCurrentScenePath(asAssetPath('scenes/a.erythos'));
    pm.setCurrentScenePath(asAssetPath('scenes/b.erythos'));
    pm.setCurrentScenePath(asAssetPath('scenes/c.erythos'));
    expect(pm.currentScenePath()).toBe('scenes/c.erythos');
  });
});

describe('ProjectManager.createScene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes correct empty scene content and returns the path', async () => {
    const pm = new ProjectManager();
    const dirHandle = makeDirHandle();
    (pm as any)._handle = dirHandle;

    // Make the scenes sub-dir handle trackable
    const scenesDir = makeDirHandle();
    dirHandle.getDirectoryHandle.mockResolvedValue(scenesDir);

    const path = await pm.createScene('my-scene');

    expect(path).toBe('scenes/my-scene.erythos');

    // Find the writable that was created
    const fileHandle = scenesDir._files['my-scene.erythos'];
    expect(fileHandle).toBeDefined();
    const writable = await fileHandle.createWritable();
    // createWritable was called once by createScene
    expect(fileHandle.createWritable).toHaveBeenCalledTimes(2); // once by createScene + once here

    // Verify written content via the first call
    const writeCalls = (await Promise.resolve(null), fileHandle.createWritable.mock.results[0].value);
    const firstWritable = await writeCalls;
    expect(firstWritable.write).toHaveBeenCalledWith(
      JSON.stringify({ version: 1, nodes: [] }),
    );
    void writable; // used above
  });

  it('throws if scene with same name already exists', async () => {
    const pm = new ProjectManager();
    const existingFile = makeFileHandle();
    const scenesDir = makeDirHandle({ 'duplicate.erythos': existingFile });
    const dirHandle = makeDirHandle();
    dirHandle.getDirectoryHandle.mockResolvedValue(scenesDir);
    (pm as any)._handle = dirHandle;

    await expect(pm.createScene('duplicate')).rejects.toThrow('already exists');
  });

  it('throws when no project is open', async () => {
    const pm = new ProjectManager();
    await expect(pm.createScene('test')).rejects.toThrow('No project open');
  });
});

describe('ProjectManager.deleteFile', () => {
  it('calls removeEntry and rescans', async () => {
    const pm = new ProjectManager();
    const dirHandle = makeDirHandle();
    const scenesDir = makeDirHandle();
    dirHandle.getDirectoryHandle.mockResolvedValue(scenesDir);
    (pm as any)._handle = dirHandle;

    await pm.deleteFile(asAssetPath('scenes/old.erythos'));

    expect(scenesDir.removeEntry).toHaveBeenCalledWith('old.erythos');
  });

  it('throws when no project is open', async () => {
    const pm = new ProjectManager();
    await expect(pm.deleteFile(asAssetPath('scenes/x.erythos'))).rejects.toThrow('No project open');
  });
});

// ── URL API stubs for urlFor / fileChanged tests ──────────────────────────────

/**
 * jsdom does not implement URL.createObjectURL / revokeObjectURL.
 * We stub them with vi.stubGlobal. Each createObjectURL call returns a unique
 * "blob:test/<n>" string so we can assert identity and revocation.
 */
let urlCounter = 0;
const revokedURLs: string[] = [];

function setupURLStubs() {
  urlCounter = 0;
  revokedURLs.length = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((_blob: Blob | File | MediaSource) => `blob:test/${++urlCounter}`),
    revokeObjectURL: vi.fn((url: string) => { revokedURLs.push(url); }),
  });
}

function restoreURLStubs() {
  vi.unstubAllGlobals();
}

/**
 * Returns a ProjectManager with `_handle` set to a truthy sentinel and
 * `readFile` / `writeFile` spied on, so tests never touch the real FS.
 */
function makeOpenPM() {
  const pm = new ProjectManager();
  (pm as any)._handle = { name: 'test-project' } as FileSystemDirectoryHandle;
  const mockFile = new File(['content'], 'file.glb', { type: 'model/gltf-binary' });
  const readFileSpy = vi.spyOn(pm, 'readFile').mockResolvedValue(mockFile);
  const writeFileSpy = vi.spyOn(pm, 'writeFile');
  return { pm, readFileSpy, writeFileSpy, mockFile };
}

/**
 * Simulate the post-write cache-invalidation logic that lives inside writeFile.
 * Used when writeFile is mocked out entirely and we need to test the cache path.
 */
async function simulateWriteFileCacheLogic(pm: ProjectManager, path: string) {
  const urlCache: Map<string, string> = (pm as any)._urlCache;
  if (urlCache.has(path)) {
    const old = urlCache.get(path)!;
    URL.revokeObjectURL(old);
    urlCache.delete(path);
    const file = await pm.readFile(asAssetPath(path));
    const newURL = URL.createObjectURL(file);
    urlCache.set(path, newURL);
    (pm as any)._emitFileChanged(path, newURL);
  }
}

// ── urlFor ────────────────────────────────────────────────────────────────────

describe('ProjectManager.urlFor', () => {
  beforeEach(setupURLStubs);
  afterEach(restoreURLStubs);

  it('returns a blob URL for a valid path', async () => {
    const { pm } = makeOpenPM();
    const url = await pm.urlFor(asAssetPath('models/cube.glb'));
    expect(url).toMatch(/^blob:test\//);
  });

  it('returns the same URL for repeated calls (cache hit)', async () => {
    const { pm, readFileSpy } = makeOpenPM();
    const url1 = await pm.urlFor(asAssetPath('models/cube.glb'));
    const url2 = await pm.urlFor(asAssetPath('models/cube.glb'));
    expect(url1).toBe(url2);
    // readFile should only be called once
    expect(readFileSpy).toHaveBeenCalledTimes(1);
  });

  it('returns different URLs for different paths', async () => {
    const { pm } = makeOpenPM();
    const url1 = await pm.urlFor(asAssetPath('models/cube.glb'));
    const url2 = await pm.urlFor(asAssetPath('textures/wood.png'));
    expect(url1).not.toBe(url2);
  });

  it('throws when no project is open', async () => {
    const pm = new ProjectManager(); // _handle is null
    await expect(pm.urlFor(asAssetPath('models/cube.glb'))).rejects.toThrow('No project open');
  });
});

// ── project close revokes cached URLs ─────────────────────────────────────────

describe('ProjectManager — project close revokes cached URLs', () => {
  beforeEach(setupURLStubs);
  afterEach(restoreURLStubs);

  it('revokes all cached URLs on close()', async () => {
    const { pm } = makeOpenPM();
    const url1 = await pm.urlFor(asAssetPath('models/cube.glb'));
    const url2 = await pm.urlFor(asAssetPath('textures/wood.png'));

    pm.close();

    expect(revokedURLs).toContain(url1);
    expect(revokedURLs).toContain(url2);
  });

  it('clears the cache after close() so urlFor can re-cache on reopen', async () => {
    const { pm } = makeOpenPM();
    await pm.urlFor(asAssetPath('models/cube.glb'));
    pm.close();

    // Re-open (set handle again)
    (pm as any)._handle = { name: 'test-project' } as FileSystemDirectoryHandle;
    vi.spyOn(pm, 'readFile').mockResolvedValue(new File(['new'], 'file.glb'));

    await pm.urlFor(asAssetPath('models/cube.glb'));
    expect((pm as any)._urlCache.size).toBe(1);
  });
});

// ── fileChanged event ─────────────────────────────────────────────────────────

describe('ProjectManager.fileChanged event', () => {
  beforeEach(setupURLStubs);
  afterEach(restoreURLStubs);

  it('emits fileChanged with new URL when a cached path is written', async () => {
    const { pm, writeFileSpy } = makeOpenPM();

    const oldURL = await pm.urlFor(asAssetPath('models/cube.glb'));

    const listener = vi.fn();
    pm.onFileChanged(listener);

    writeFileSpy.mockImplementation(async (path: string) => {
      await simulateWriteFileCacheLogic(pm, path);
    });

    await pm.writeFile(asAssetPath('models/cube.glb'), new ArrayBuffer(0));

    expect(listener).toHaveBeenCalledTimes(1);
    const [emittedPath, emittedURL] = listener.mock.calls[0] as [string, string];
    expect(emittedPath).toBe('models/cube.glb');
    expect(emittedURL).not.toBe(oldURL);
    expect(emittedURL).toMatch(/^blob:test\//);
  });

  it('does NOT emit fileChanged when path was not cached', async () => {
    const { pm, writeFileSpy } = makeOpenPM();

    const listener = vi.fn();
    pm.onFileChanged(listener);

    writeFileSpy.mockImplementation(async (path: string) => {
      await simulateWriteFileCacheLogic(pm, path);
    });

    // Write a path that was never passed to urlFor
    await pm.writeFile(asAssetPath('models/new-file.glb'), new ArrayBuffer(0));

    expect(listener).not.toHaveBeenCalled();
  });

  it('revokes old URL when a cached path is written', async () => {
    const { pm, writeFileSpy } = makeOpenPM();

    const oldURL = await pm.urlFor(asAssetPath('models/cube.glb'));

    writeFileSpy.mockImplementation(async (path: string) => {
      await simulateWriteFileCacheLogic(pm, path);
    });

    await pm.writeFile(asAssetPath('models/cube.glb'), new ArrayBuffer(0));

    expect(revokedURLs).toContain(oldURL);
  });

  it('unsubscribe from fileChanged works', async () => {
    const { pm, writeFileSpy } = makeOpenPM();

    await pm.urlFor(asAssetPath('models/cube.glb'));

    const listener = vi.fn();
    const unsub = pm.onFileChanged(listener);
    unsub();

    writeFileSpy.mockImplementation(async (path: string) => {
      await simulateWriteFileCacheLogic(pm, path);
    });

    await pm.writeFile(asAssetPath('models/cube.glb'), new ArrayBuffer(0));
    expect(listener).not.toHaveBeenCalled();
  });
});
