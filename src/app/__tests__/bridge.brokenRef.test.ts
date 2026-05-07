/**
 * bridge.brokenRef.test.ts
 *
 * Verifies that `brokenRefIds` signal in EditorBridge reacts correctly when:
 *  1. editor.events emits 'brokenRefsChanged' (fired by Editor.loadScene)
 *  2. sceneDocument emits 'sceneReplaced' (fired by SceneDocument.deserialize)
 *
 * Key regression guarded: setBrokenRefIds() must pass a NEW Set instance each time.
 * If the same Set reference is re-used, SolidJS === equality sees no change and
 * skips re-running dependent effects — silent UI freeze.
 *
 * We verify this with a direct object-identity check: emitting the event twice
 * must produce two distinct Set references from bridge.brokenRefIds().
 * With the old code (no `new Set()`), the second emit passes the same underlying
 * `_brokenRefIds` reference → accessor returns the same object → test fails.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { asNodeUUID } from '../../utils/branded';

// Mock IndexedDB-backed ProjectHandleStore so tests don't need a real IDB
// (createEditorBridge → getRecentProjects() → ProjectHandleStore.loadProjects)
vi.mock('../../core/project/ProjectHandleStore', () => ({
  loadProjects: vi.fn().mockResolvedValue([]),
  saveProject: vi.fn().mockResolvedValue(undefined),
  removeProject: vi.fn().mockResolvedValue(undefined),
}));

import { Editor } from '../../core/Editor';
import { ProjectManager } from '../../core/project/ProjectManager';
import { createEditorBridge } from '../bridge';

describe('bridge brokenRefIds reactivity', () => {
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

  it('initial value is an empty Set', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);
      expect(bridge.brokenRefIds().size).toBe(0);
    });
  });

  it('brokenRefsChanged event updates the signal with new broken id', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      const id = asNodeUUID('broken-node-1');
      editor.sceneSync.markBrokenRef(id);
      editor.events.emit('brokenRefsChanged');

      expect(bridge.brokenRefIds().size).toBe(1);
      expect(bridge.brokenRefIds().has(id)).toBe(true);
    });
  });

  it('each brokenRefsChanged call produces a new Set reference (SolidJS === equality guard)', () => {
    // This is the core regression guard.
    // Without `new Set()` in setBrokenRefIds, the second and subsequent calls to
    // onBrokenRefsChanged pass the SAME underlying _brokenRefIds Set object.
    // SolidJS compares stored value === new value and skips re-running effects.
    // We verify that each emission stores a different Set reference.
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      // First emission
      editor.sceneSync.markBrokenRef(asNodeUUID('node-a'));
      editor.events.emit('brokenRefsChanged');
      const ref1 = bridge.brokenRefIds();

      // Second emission (without clearing — adds another ref)
      editor.sceneSync.markBrokenRef(asNodeUUID('node-b'));
      editor.events.emit('brokenRefsChanged');
      const ref2 = bridge.brokenRefIds();

      // ref2 must be a DIFFERENT object from ref1 so SolidJS reactive system
      // recognises the change and re-runs dependent effects/JSX.
      expect(ref2).not.toBe(ref1);
      expect(ref2.has(asNodeUUID('node-b'))).toBe(true);
    });
  });

  it('sceneReplaced event resets brokenRefIds and produces a new Set reference', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      // Add a broken ref
      editor.sceneSync.markBrokenRef(asNodeUUID('stale-node'));
      editor.events.emit('brokenRefsChanged');
      const refBefore = bridge.brokenRefIds();
      expect(refBefore.size).toBe(1);

      // Scene replace: clear broken refs then fire sceneReplaced
      editor.sceneSync.clearBrokenRefs();
      editor.sceneDocument.events.emit('sceneReplaced');

      const refAfter = bridge.brokenRefIds();
      expect(refAfter.size).toBe(0);
      // Must be a new Set reference for SolidJS reactivity
      expect(refAfter).not.toBe(refBefore);
    });
  });
});
