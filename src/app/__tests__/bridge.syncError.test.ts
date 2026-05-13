/**
 * bridge.syncError.test.ts
 *
 * Verifies:
 *  - emit 'syncError' event → bridge.syncError() signal updates
 *  - bridge.dismissSyncError() → signal clears to null
 *  - bridge.dispose() → syncError signal cleared
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
import type { SyncErrorPayload } from '../bridge';

describe('bridge syncError signal', () => {
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

  it('emit syncError event → bridge.syncError() signal updates', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      // Initially null
      expect(bridge.syncError()).toBeNull();

      const payload: SyncErrorPayload = {
        kind: 'payload-too-large',
        message: 'Scene exceeds size limit',
      };

      editor.events.emit('syncError', payload);

      expect(bridge.syncError()).toMatchObject({
        kind: 'payload-too-large',
        message: 'Scene exceeds size limit',
      });
    });
  });

  it('dismissSyncError() → signal clears to null', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      editor.events.emit('syncError', {
        kind: 'sync-failed-local-saved',
        message: 'Sync failed, local is saved',
      });
      expect(bridge.syncError()).not.toBeNull();

      bridge.dismissSyncError();
      expect(bridge.syncError()).toBeNull();
    });
  });

  it('dispose() → syncError signal cleared to null', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      editor.events.emit('syncError', {
        kind: 'network-offline',
        message: 'Sync failed (offline), local is saved',
      });
      expect(bridge.syncError()).not.toBeNull();

      bridge.dispose();
      expect(bridge.syncError()).toBeNull();
    });
  });

  it('emit multiple syncError events → last one wins', () => {
    createRoot((dispose) => {
      disposeRoot = dispose;
      const bridge = createEditorBridge(editor);

      editor.events.emit('syncError', { kind: 'payload-too-large', message: 'First' });
      editor.events.emit('syncError', { kind: 'client-bug', message: 'Second' });

      expect(bridge.syncError()?.kind).toBe('client-bug');
    });
  });
});
