import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    pm.setCurrentScenePath('scenes/level-2.erythos');
    expect(pm.currentScenePath()).toBe('scenes/level-2.erythos');
  });

  it('signal switching: multiple updates reflect latest value', () => {
    const pm = new ProjectManager();
    pm.setCurrentScenePath('scenes/a.erythos');
    pm.setCurrentScenePath('scenes/b.erythos');
    pm.setCurrentScenePath('scenes/c.erythos');
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

    await pm.deleteFile('scenes/old.erythos');

    expect(scenesDir.removeEntry).toHaveBeenCalledWith('old.erythos');
  });

  it('throws when no project is open', async () => {
    const pm = new ProjectManager();
    await expect(pm.deleteFile('scenes/x.erythos')).rejects.toThrow('No project open');
  });
});
