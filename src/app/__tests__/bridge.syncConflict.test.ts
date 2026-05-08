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
import { ProjectManager } from '../../core/project/ProjectManager';
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

      // Emit syncConflict event
      editor.events.emit('syncConflict', {
        sceneId: 'scene-abc',
        scenePath: 'scenes/scene.erythos' as AssetPath,
        baseVersion: 6,
        currentVersion: 7,
      });

      expect(bridge.syncConflict()).toEqual({
        sceneId: 'scene-abc',
        scenePath: 'scenes/scene.erythos',
        baseVersion: 6,
        currentVersion: 7,
      });
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
});
