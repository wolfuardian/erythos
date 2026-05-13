/**
 * bridge.readOnly.test.ts
 *
 * Verifies:
 *  1. bridge.editorReadOnly() reflects editor.readOnly() signal (default false).
 *  2. After editor.setReadOnly(true), bridge.editorReadOnly() returns true.
 *  3. After toggling back to false, bridge.editorReadOnly() returns false.
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
import { createEditorBridge } from '../bridge';

describe('bridge editorReadOnly signal', () => {
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

  it('1. bridge.editorReadOnly() is false by default', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);
      expect(bridge.editorReadOnly()).toBe(false);
    });
  });

  it('2. editor.setReadOnly(true) → bridge.editorReadOnly() returns true', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);
      editor.setReadOnly(true);
      expect(bridge.editorReadOnly()).toBe(true);
    });
  });

  it('3. toggling readOnly back to false → bridge.editorReadOnly() returns false', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);
      editor.setReadOnly(true);
      editor.setReadOnly(false);
      expect(bridge.editorReadOnly()).toBe(false);
    });
  });
});
