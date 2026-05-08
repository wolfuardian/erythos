import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutoSave } from './AutoSave';
import { SceneDocument } from './SceneDocument';
import { ConflictError } from '../sync/SyncEngine';
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

    // syncConflict event emitted
    expect(conflictEvents).toHaveLength(1);
    expect(conflictEvents[0]).toEqual({
      sceneId: 'scene-1',
      scenePath: 'scenes/scene.erythos',
      baseVersion: 3,
      currentVersion: 5,
    });
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
