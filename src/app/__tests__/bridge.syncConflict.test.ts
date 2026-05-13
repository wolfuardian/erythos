/**
 * bridge.syncConflict.test.ts
 *
 * Verifies:
 *  6. Emitting 'syncConflict' event updates the bridge.syncConflict() signal.
 *  7. Calling bridge.resolveSyncConflict('keep-local') delegates to deps.resolveSyncConflict.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'solid-js';

// Mock IndexedDB-backed ProjectHandleStore so tests don't need a real IDB
vi.mock('../../core/project/ProjectHandleStore', () => ({
  loadProjects: vi.fn().mockResolvedValue([]),
  saveProject: vi.fn().mockResolvedValue(undefined),
  removeProject: vi.fn().mockResolvedValue(undefined),
}));

import { Editor } from '../../core/Editor';
import { LocalProjectManager as ProjectManager } from '../../core/project/LocalProjectManager';
import { SceneDocument } from '../../core/scene/SceneDocument';
import type { AssetPath } from '../../utils/branded';
import { createEditorBridge } from '../bridge';

describe('bridge syncConflict signal', () => {
  let editor: Editor;
  let disposeRoot: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor(new ProjectManager());
  });

  afterEach(() => {
    disposeRoot?.();
    editor.dispose();
    vi.useRealTimers();
  });

  /**
   * Test 6: emit syncConflict → bridge signal updates
   */
  it('6. emit syncConflict event → bridge.syncConflict() signal updates', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      // Initially null
      expect(bridge.syncConflict()).toBeNull();

      const localDoc = new SceneDocument();
      const cloudDoc = new SceneDocument();

      // Emit syncConflict event
      editor.events.emit('syncConflict', {
        sceneId: 'scene-abc',
        scenePath: 'scenes/scene.erythos' as AssetPath,
        baseVersion: 6,
        currentVersion: 7,
        localBody: localDoc,
        cloudBody: cloudDoc,
      });

      expect(bridge.syncConflict()).toMatchObject({
        sceneId: 'scene-abc',
        scenePath: 'scenes/scene.erythos',
        baseVersion: 6,
        currentVersion: 7,
      });
      expect(bridge.syncConflict()!.localBody).toBe(localDoc);
      expect(bridge.syncConflict()!.cloudBody).toBe(cloudDoc);
    });
  });

  /**
   * Test 7: bridge.resolveSyncConflict delegates to deps.resolveSyncConflict
   */
  it('7. bridge.resolveSyncConflict delegates to injected deps.resolveSyncConflict', async () => {
    const resolveFn = vi.fn().mockResolvedValue(undefined);

    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor, [], {
        closeProject: () => {},
        projectManager: editor.projectManager,
        openProjectById: () => Promise.resolve(),
        autosaveFlush: () => Promise.resolve(),
        resolveSyncConflict: resolveFn,
      });

      void bridge.resolveSyncConflict('keep-local');

      expect(resolveFn).toHaveBeenCalledWith('keep-local');
    });
  });

  /**
   * Test 8: resolveSyncConflict('keep-local') clears the syncConflict signal
   * so the SyncConflictDialog unmounts after the user clicks Keep local.
   *
   * Regression: without the clear, the autosave layer dropped pendingConflict
   * but the bridge signal stayed set → dialog stayed mounted → buttons looked
   * dead. (T5 / T6 release blocker手測 trigger.)
   */
  it('8. resolveSyncConflict(keep-local) clears syncConflict signal', async () => {
    const resolveFn = vi.fn().mockResolvedValue(undefined);

    await new Promise<void>((doneTest) => {
      createRoot((dispose) => {
        disposeRoot = dispose;
        const bridge = createEditorBridge(editor, [], {
          closeProject: () => {},
          projectManager: editor.projectManager,
          openProjectById: () => Promise.resolve(),
          autosaveFlush: () => Promise.resolve(),
          resolveSyncConflict: resolveFn,
        });

        editor.events.emit('syncConflict', {
          sceneId: 'scene-abc',
          scenePath: 'scenes/scene.erythos' as AssetPath,
          baseVersion: 6,
          currentVersion: 7,
          localBody: new SceneDocument(),
          cloudBody: new SceneDocument(),
        });
        expect(bridge.syncConflict()).not.toBeNull();

        void bridge.resolveSyncConflict('keep-local').then(() => {
          expect(bridge.syncConflict()).toBeNull();
          doneTest();
        });
      });
    });
  });

  /**
   * Test 9: resolveSyncConflict('use-cloud') also clears the signal.
   * Same root cause as test 8 — both Keep local and Use cloud version buttons
   * route through resolveSyncConflict, so both paths must clear.
   */
  it('9. resolveSyncConflict(use-cloud) clears syncConflict signal', async () => {
    const resolveFn = vi.fn().mockResolvedValue(undefined);

    await new Promise<void>((doneTest) => {
      createRoot((dispose) => {
        disposeRoot = dispose;
        const bridge = createEditorBridge(editor, [], {
          closeProject: () => {},
          projectManager: editor.projectManager,
          openProjectById: () => Promise.resolve(),
          autosaveFlush: () => Promise.resolve(),
          resolveSyncConflict: resolveFn,
        });

        editor.events.emit('syncConflict', {
          sceneId: 'scene-abc',
          scenePath: 'scenes/scene.erythos' as AssetPath,
          baseVersion: 6,
          currentVersion: 7,
          localBody: new SceneDocument(),
          cloudBody: new SceneDocument(),
        });
        expect(bridge.syncConflict()).not.toBeNull();

        void bridge.resolveSyncConflict('use-cloud').then(() => {
          expect(bridge.syncConflict()).toBeNull();
          doneTest();
        });
      });
    });
  });
});
