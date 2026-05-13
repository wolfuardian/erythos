import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createAutoSave } from './AutoSave';
import type { MultiTabCoord } from '../sync/MultiTabCoord';
import { SceneDocument } from './SceneDocument';
import {
  ConflictError,
  PayloadTooLargeError,
  PreconditionError,
  PreconditionRequiredError,
  ServerError,
  NetworkError,
} from '../sync/SyncEngine';
import { EventEmitter } from '../EventEmitter';
import type { Editor } from '../Editor';
import type { AssetPath } from '../../utils/branded';

// ── Minimal Editor mock ──────────────────────────────────────────────────────

function makeEditor(overrides?: Partial<{
  syncSceneId: string | null;
  syncBaseVersion: number | null;
  writeFileImpl: (path: AssetPath, data: string) => Promise<void>;
  pushImpl: (...args: unknown[]) => Promise<{ version: number }>;
}>): Editor {
  const sceneDocument = new SceneDocument();
  const events = new EventEmitter();

  const writeFile = vi.fn(overrides?.writeFileImpl ?? ((_path: AssetPath, _data: string) => Promise.resolve()));

  const pushFn = vi.fn(overrides?.pushImpl ?? (() => Promise.resolve({ version: 1 })));

  const syncEngine = {
    push: pushFn,
    fetch: vi.fn(),
    create: vi.fn(),
  };

  const projectManager = {
    currentScenePath: () => 'scenes/scene.erythos' as AssetPath,
    writeFile,
    isOpen: true,
    name: 'test-project',
    currentId: 'test-id',
    getFiles: () => [],
    onChange: () => () => {},
    getRecentProjects: () => Promise.resolve([]),
  };

  return {
    sceneDocument,
    events,
    projectManager,
    syncEngine,
    syncSceneId: overrides?.syncSceneId ?? 'scene-1',
    syncBaseVersion: overrides?.syncBaseVersion ?? 0,
  } as unknown as Editor;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AutoSave conflict flow', () => {
  /**
   * Test 1: ConflictError → .bak written, syncConflict emitted, pendingConflict set
   */
  it('1. stub syncEngine throws ConflictError → .bak written, syncConflict emitted', async () => {
    const remoteDoc = new SceneDocument();
    const conflictErr = new ConflictError('scene-1', 5, remoteDoc);

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 3,
      pushImpl: () => Promise.reject(conflictErr),
    });

    const conflictEvents: { sceneId: string; currentVersion: number }[] = [];
    editor.events.on('syncConflict', (payload) => conflictEvents.push(payload));

    const handle = createAutoSave(editor);
    await handle.flushNow();

    // .bak written with base version 3 (the stale version)
    const writeFileMock = (editor.projectManager.writeFile as ReturnType<typeof vi.fn>);
    const bakCall = writeFileMock.mock.calls.find(([path]) => String(path).includes('.bak'));
    expect(bakCall).toBeDefined();
    expect(String(bakCall![0])).toBe('scenes/scene.erythos.bak.v3');

    // syncConflict event emitted with version fields + body refs
    expect(conflictEvents).toHaveLength(1);
    expect(conflictEvents[0]).toMatchObject({
      sceneId: 'scene-1',
      scenePath: 'scenes/scene.erythos',
      baseVersion: 3,
      currentVersion: 5,
    });
    // localBody is a snapshot (not the live sceneDocument ref) — verify structural equality
    // cloudBody === the remote doc from ConflictError (still a direct reference)
    const localBody = (conflictEvents[0] as any).localBody as import('./SceneDocument').SceneDocument;
    expect(localBody).not.toBe(editor.sceneDocument);
    expect(localBody.serialize()).toEqual(editor.sceneDocument.serialize());
    expect((conflictEvents[0] as any).cloudBody).toBe(remoteDoc);
  });

  /**
   * Test 2: resolveConflict('keep-local') → re-push uses currentVersion as baseVersion;
   * on success → pendingConflict cleared, syncBaseVersion updated
   */
  it('2. resolveConflict(keep-local) re-pushes with currentVersion and clears pendingConflict', async () => {
    let pushCallCount = 0;
    const remoteDoc = new SceneDocument();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 2,
      pushImpl: () => {
        pushCallCount++;
        if (pushCallCount === 1) {
          return Promise.reject(new ConflictError('scene-1', 7, remoteDoc));
        }
        return Promise.resolve({ version: 8 });
      },
    });

    const handle = createAutoSave(editor);
    await handle.flushNow(); // triggers conflict, pendingConflict set

    expect(pushCallCount).toBe(1);

    await handle.resolveConflict('keep-local');

    expect(pushCallCount).toBe(2);

    // push was called with currentVersion (7) as baseVersion
    const syncPush = (editor.syncEngine!.push as ReturnType<typeof vi.fn>);
    const secondPushArgs = syncPush.mock.calls[1];
    // secondPushArgs = [sceneId, body, baseVersion]
    expect(secondPushArgs[2]).toBe(7);

    // syncBaseVersion updated to new version after re-push
    expect(editor.syncBaseVersion).toBe(8);
  });

  /**
   * Test 3: resolveConflict('use-cloud') → sceneDocument has remote nodes,
   * syncBaseVersion === currentVersion, pendingConflict cleared
   */
  it('3. resolveConflict(use-cloud) applies remote body and updates syncBaseVersion', async () => {
    const remoteDoc = new SceneDocument();
    // Add a distinguishing node to remote doc
    remoteDoc.setEnv({ intensity: 42 });

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 0,
      pushImpl: () => Promise.reject(new ConflictError('scene-1', 9, remoteDoc)),
    });

    const handle = createAutoSave(editor);
    await handle.flushNow(); // triggers conflict

    await handle.resolveConflict('use-cloud');

    // sceneDocument now reflects remote body (env intensity = 42)
    expect(editor.sceneDocument.env.intensity).toBe(42);
    // syncBaseVersion set to currentVersion
    expect(editor.syncBaseVersion).toBe(9);
  });

  /**
   * Test 4: double conflict — resolveConflict('keep-local') re-push throws 409 again
   * → new pendingConflict replaces old one, new .bak written, new emit
   */
  it('4. double conflict: keep-local re-push 409 → new pendingConflict, new bak, new emit', async () => {
    const remoteDoc1 = new SceneDocument();
    const remoteDoc2 = new SceneDocument();
    let pushCallCount = 0;

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => {
        pushCallCount++;
        if (pushCallCount === 1) {
          return Promise.reject(new ConflictError('scene-1', 5, remoteDoc1));
        }
        return Promise.reject(new ConflictError('scene-1', 6, remoteDoc2));
      },
    });

    const conflictEvents: { sceneId: string; currentVersion: number }[] = [];
    editor.events.on('syncConflict', (payload) => conflictEvents.push(payload));

    const handle = createAutoSave(editor);
    await handle.flushNow(); // first conflict
    expect(conflictEvents).toHaveLength(1);
    expect(conflictEvents[0].currentVersion).toBe(5);

    await handle.resolveConflict('keep-local'); // second conflict
    expect(conflictEvents).toHaveLength(2);
    expect(conflictEvents[1].currentVersion).toBe(6);

    // second .bak should exist (bak.v5 since after resolveConflict we set syncBaseVersion=5)
    const writeFileMock = (editor.projectManager.writeFile as ReturnType<typeof vi.fn>);
    const bakCalls = writeFileMock.mock.calls.filter(([path]) => String(path).includes('.bak'));
    expect(bakCalls).toHaveLength(2);
    expect(String(bakCalls[0][0])).toBe('scenes/scene.erythos.bak.v1');
    expect(String(bakCalls[1][0])).toBe('scenes/scene.erythos.bak.v5');
  });

  // ── F-3 sync error tests ────────────────────────────────────────────────────

  /**
   * Test F3-1: 413 PayloadTooLargeError → emits syncError 'payload-too-large', no retry
   */
  it('F3-1. 413 PayloadTooLargeError → emits syncError payload-too-large', async () => {
    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => Promise.reject(new PayloadTooLargeError('scene-1')),
    });

    const syncErrorEvents: { kind: string; message: string }[] = [];
    editor.events.on('syncError', (payload) => syncErrorEvents.push(payload));

    const handle = createAutoSave(editor);
    await handle.flushNow();

    expect(syncErrorEvents).toHaveLength(1);
    expect(syncErrorEvents[0].kind).toBe('payload-too-large');

    // Verify push was only called once — no retry
    const pushMock = (editor.syncEngine!.push as ReturnType<typeof vi.fn>);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Test F3-2: 412 PreconditionError → emits syncError 'client-bug', does NOT emit syncConflict
   */
  it('F3-2. 412 PreconditionError → emits syncError client-bug, no conflict dialog', async () => {
    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => Promise.reject(new PreconditionError('scene-1')),
    });

    const syncErrorEvents: { kind: string; message: string }[] = [];
    const syncConflictEvents: unknown[] = [];
    editor.events.on('syncError', (payload) => syncErrorEvents.push(payload));
    editor.events.on('syncConflict', (payload) => syncConflictEvents.push(payload));

    const handle = createAutoSave(editor);
    await handle.flushNow();

    expect(syncErrorEvents).toHaveLength(1);
    expect(syncErrorEvents[0].kind).toBe('client-bug');
    // MUST NOT trigger the conflict dialog
    expect(syncConflictEvents).toHaveLength(0);
  });

  /**
   * Test F3-3: 428 PreconditionRequiredError → emits syncError 'client-bug', no conflict dialog
   */
  it('F3-3. 428 PreconditionRequiredError → emits syncError client-bug', async () => {
    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => Promise.reject(new PreconditionRequiredError('scene-1')),
    });

    const syncErrorEvents: { kind: string }[] = [];
    editor.events.on('syncError', (payload) => syncErrorEvents.push(payload));

    const handle = createAutoSave(editor);
    await handle.flushNow();

    expect(syncErrorEvents).toHaveLength(1);
    expect(syncErrorEvents[0].kind).toBe('client-bug');
  });

  /**
   * Test F3-4: 500 ServerError — retry once, second success → no syncError emitted
   */
  it('F3-4. 500 ServerError retry succeeds → no syncError emitted', async () => {
    vi.useFakeTimers();
    let pushCount = 0;
    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => {
        pushCount++;
        if (pushCount === 1) return Promise.reject(new ServerError(500, 'scene-1'));
        return Promise.resolve({ version: 2 });
      },
    });

    const syncErrorEvents: unknown[] = [];
    editor.events.on('syncError', (payload) => syncErrorEvents.push(payload));

    const handle = createAutoSave(editor);
    const flushPromise = handle.flushNow();
    // First push fails, then the 1s timer fires, then second push
    await vi.runAllTimersAsync();
    await flushPromise;

    // Two attempts total
    expect(pushCount).toBe(2);
    // No error banner — second attempt succeeded
    expect(syncErrorEvents).toHaveLength(0);
    expect(editor.syncBaseVersion).toBe(2);
    vi.useRealTimers();
  });

  /**
   * Test F3-5: 500 ServerError — both attempts fail → emits syncError 'sync-failed-local-saved'
   */
  it('F3-5. 500 ServerError both attempts fail → emits syncError sync-failed-local-saved', async () => {
    vi.useFakeTimers();
    let pushCount = 0;
    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => {
        pushCount++;
        return Promise.reject(new ServerError(500, 'scene-1'));
      },
    });

    const syncErrorEvents: { kind: string }[] = [];
    editor.events.on('syncError', (payload) => syncErrorEvents.push(payload));

    const handle = createAutoSave(editor);
    const flushPromise = handle.flushNow();
    await vi.runAllTimersAsync();
    await flushPromise;

    expect(pushCount).toBe(2);
    expect(syncErrorEvents).toHaveLength(1);
    expect(syncErrorEvents[0].kind).toBe('sync-failed-local-saved');
    vi.useRealTimers();
  });

  /**
   * Test F3-6: NetworkError — both attempts fail → emits syncError 'network-offline'
   */
  it('F3-6. NetworkError both attempts fail → emits syncError network-offline', async () => {
    vi.useFakeTimers();
    let pushCount = 0;
    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => {
        pushCount++;
        return Promise.reject(new NetworkError('Failed to fetch'));
      },
    });

    const syncErrorEvents: { kind: string }[] = [];
    editor.events.on('syncError', (payload) => syncErrorEvents.push(payload));

    const handle = createAutoSave(editor);
    const flushPromise = handle.flushNow();
    await vi.runAllTimersAsync();
    await flushPromise;

    expect(pushCount).toBe(2);
    expect(syncErrorEvents).toHaveLength(1);
    expect(syncErrorEvents[0].kind).toBe('network-offline');
    vi.useRealTimers();
  });

  /**
   * Test 5: suppression — when pendingConflict is set, flushNow does NOT call syncEngine.push
   * again; legacy writeFile still runs
   */
  it('5. pendingConflict suppresses subsequent flushNow push (legacy writeFile still runs)', async () => {
    const remoteDoc = new SceneDocument();
    let pushCallCount = 0;

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 0,
      pushImpl: () => {
        pushCallCount++;
        if (pushCallCount === 1) {
          return Promise.reject(new ConflictError('scene-1', 3, remoteDoc));
        }
        return Promise.resolve({ version: 4 });
      },
    });

    const handle = createAutoSave(editor);
    await handle.flushNow(); // first flush: push throws conflict → pendingConflict set
    expect(pushCallCount).toBe(1);

    await handle.flushNow(); // second flush: suppressed push
    expect(pushCallCount).toBe(1); // push NOT called a second time

    // Legacy writeFile (scenes/scene.erythos) called twice (both flushes)
    const writeFileMock = (editor.projectManager.writeFile as ReturnType<typeof vi.fn>);
    const regularWrites = writeFileMock.mock.calls.filter(([path]) => !String(path).includes('.bak'));
    expect(regularWrites.length).toBeGreaterThanOrEqual(2);
  });
});

// ── F-3 multi-tab coordination tests ────────────────────────────────────────

/** Build a minimal MultiTabCoord mock. */
function makeMockCoord(): {
  coord: MultiTabCoord;
  acquireCount: number[];
  broadcastedVersions: { sceneId: string; version: number }[];
  versionCallbacks: Map<string, (v: number) => void>;
} {
  const acquireCount = [0];
  const broadcastedVersions: { sceneId: string; version: number }[] = [];
  const versionCallbacks = new Map<string, (v: number) => void>();

  const coord: MultiTabCoord = {
    withWriteLock: vi.fn(async (_sceneId: string, fn: () => Promise<unknown>) => {
      acquireCount[0]++;
      return fn();
    }),
    broadcastVersion: vi.fn((sceneId: string, version: number) => {
      broadcastedVersions.push({ sceneId, version });
    }),
    onVersionChanged: vi.fn((sceneId: string, cb: (v: number) => void) => {
      versionCallbacks.set(sceneId, cb);
      return () => { versionCallbacks.delete(sceneId); };
    }),
    dispose: vi.fn(),
  };

  return { coord, acquireCount, broadcastedVersions, versionCallbacks };
}

describe('AutoSave multi-tab coordination (F-3)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * MT-1: successful push broadcasts the new version to other tabs
   */
  it('MT-1. successful push → broadcastVersion called with new version', async () => {
    const { coord, broadcastedVersions } = makeMockCoord();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 0,
      pushImpl: () => Promise.resolve({ version: 3 }),
    });

    const handle = createAutoSave(editor, coord);
    await handle.flushNow();

    expect(broadcastedVersions).toHaveLength(1);
    expect(broadcastedVersions[0]).toEqual({ sceneId: 'scene-1', version: 3 });

    handle.dispose();
  });

  /**
   * MT-2: each flushNow acquires withWriteLock once per call
   */
  it('MT-2. flushNow acquires write lock once per push attempt', async () => {
    const { coord, acquireCount } = makeMockCoord();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 0,
      pushImpl: () => Promise.resolve({ version: 1 }),
    });

    const handle = createAutoSave(editor, coord);
    await handle.flushNow();
    expect(acquireCount[0]).toBe(1);

    await handle.flushNow();
    expect(acquireCount[0]).toBe(2);

    handle.dispose();
  });

  /**
   * MT-3: receiving a version update from another tab bumps baseVersion
   * so the next push uses the current version instead of stale one
   */
  it('MT-3. onVersionChanged callback raises baseVersion when higher', async () => {
    const { coord, versionCallbacks } = makeMockCoord();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 2,
      pushImpl: () => Promise.resolve({ version: 5 }),
    });

    const handle = createAutoSave(editor, coord);

    // Simulate another tab broadcasting version 4 (higher than our base 2).
    const cb = versionCallbacks.get('scene-1');
    expect(cb).toBeDefined();
    cb!(4);

    // syncBaseVersion should now be 4.
    expect(editor.syncBaseVersion).toBe(4);

    handle.dispose();
  });

  /**
   * MT-4: receiving a version update that is NOT higher than baseVersion is ignored
   */
  it('MT-4. onVersionChanged ignores stale version (not higher than baseVersion)', async () => {
    const { coord, versionCallbacks } = makeMockCoord();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 10,
      pushImpl: () => Promise.resolve({ version: 11 }),
    });

    const handle = createAutoSave(editor, coord);

    const cb = versionCallbacks.get('scene-1');
    cb!(5); // stale — below current base 10

    // Should NOT change.
    expect(editor.syncBaseVersion).toBe(10);

    handle.dispose();
  });

  /**
   * MT-5: resolveConflict('keep-local') also acquires lock for its re-push
   */
  it('MT-5. resolveConflict(keep-local) re-push also acquires write lock', async () => {
    const { coord, acquireCount, broadcastedVersions } = makeMockCoord();

    let pushCallCount = 0;
    const remoteDoc = new SceneDocument();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 1,
      pushImpl: () => {
        pushCallCount++;
        if (pushCallCount === 1) {
          return Promise.reject(new ConflictError('scene-1', 5, remoteDoc));
        }
        return Promise.resolve({ version: 6 });
      },
    });

    const handle = createAutoSave(editor, coord);
    await handle.flushNow(); // first push: 409, pendingConflict set; lock acquired once

    const lockCountAfterFirst = acquireCount[0];
    expect(lockCountAfterFirst).toBe(1);

    await handle.resolveConflict('keep-local'); // re-push: lock acquired again

    expect(acquireCount[0]).toBe(2);
    expect(broadcastedVersions).toHaveLength(1);
    expect(broadcastedVersions[0].version).toBe(6);

    handle.dispose();
  });

  /**
   * MT-6: syncSceneIdChanged re-wires version subscription to new sceneId
   */
  it('MT-6. syncSceneIdChanged re-subscribes version updates to new sceneId', () => {
    const { coord, versionCallbacks } = makeMockCoord();

    const editor = makeEditor({
      syncSceneId: 'scene-old',
      syncBaseVersion: 0,
      pushImpl: () => Promise.resolve({ version: 1 }),
    });

    const handle = createAutoSave(editor, coord);

    // Initially subscribed to 'scene-old'.
    expect(versionCallbacks.has('scene-old')).toBe(true);

    // Simulate scene load → new sceneId.
    editor.syncSceneId = 'scene-new' as any;
    editor.events.emit('syncSceneIdChanged', 'scene-new');

    // Now subscribed to 'scene-new', unsubscribed from 'scene-old'.
    expect(versionCallbacks.has('scene-old')).toBe(false);
    expect(versionCallbacks.has('scene-new')).toBe(true);

    handle.dispose();
  });

  /**
   * MT-7: dispose cleans up coord and unsubscribes version listener
   */
  it('MT-7. dispose calls coord.dispose and removes syncSceneIdChanged listener', () => {
    const { coord } = makeMockCoord();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 0,
      pushImpl: () => Promise.resolve({ version: 1 }),
    });

    const handle = createAutoSave(editor, coord);
    handle.dispose();

    expect(coord.dispose).toHaveBeenCalledTimes(1);
  });

  /**
   * MT-8: lock is NOT acquired when pendingConflict is set (suppression stays outside lock)
   */
  it('MT-8. pending conflict suppression short-circuits before acquiring lock', async () => {
    const { coord, acquireCount } = makeMockCoord();

    let pushCallCount = 0;
    const remoteDoc = new SceneDocument();

    const editor = makeEditor({
      syncSceneId: 'scene-1',
      syncBaseVersion: 0,
      pushImpl: () => {
        pushCallCount++;
        if (pushCallCount === 1) {
          return Promise.reject(new ConflictError('scene-1', 3, remoteDoc));
        }
        return Promise.resolve({ version: 4 });
      },
    });

    const handle = createAutoSave(editor, coord);
    await handle.flushNow(); // first flush: 409, pendingConflict set; lock acquired once
    const lockAfterFirst = acquireCount[0];

    await handle.flushNow(); // second flush: suppressed (pendingConflict set) → no lock
    expect(acquireCount[0]).toBe(lockAfterFirst); // lock count unchanged

    handle.dispose();
  });
});
