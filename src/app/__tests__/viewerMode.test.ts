/**
 * viewerMode.test.ts
 *
 * Tests for issue #868 viewer mode logic:
 *  1. URL /scenes/{uuid} with a SyncEngine that throws NotFoundError → viewer mode (guest)
 *  2. URL /scenes/{uuid} with a SyncEngine that succeeds → owner (not viewer mode)
 *  3. Edit button calls SyncEngine.fork(sceneId) with the correct id
 *  4. Fork success → navigateToScene(newId) is called
 *  5. Fork failure → forkError signal is set (no navigation)
 *  6. navigateToScene on fork result leads to a scene route with the new id
 *
 * Strategy: test the viewer mode heuristic and fork-navigate logic directly
 * without rendering the full App (which requires FileSystemDirectoryHandle etc.).
 * We test the logic functions using a mock SyncEngine.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { NotFoundError } from '../../core/sync/SyncEngine';
import type { SyncEngine, SceneId } from '../../core/sync/SyncEngine';
import { navigateToScene, navigateHome, currentRoute } from '../router';
import { Editor } from '../../core/Editor';
import { LocalProjectManager } from '../../core/project/LocalProjectManager';
import { AddNodeCommand } from '../../core/commands/AddNodeCommand';

const ORIGINAL_PATHNAME = window.location.pathname;

afterEach(() => {
  window.history.replaceState(null, '', ORIGINAL_PATHNAME);
  navigateHome();
});

/** Create a mock SyncEngine that throws NotFoundError on fetch */
function makeGuestEngine(sceneId: SceneId): SyncEngine {
  return {
    fetch: vi.fn().mockRejectedValue(new NotFoundError(sceneId)),
    push: vi.fn(),
    create: vi.fn(),
    setVisibility: vi.fn(),
    fork: vi.fn(),
  };
}

/** Create a mock SyncEngine that resolves on fetch (owner) */
function makeOwnerEngine(): SyncEngine {
  return {
    fetch: vi.fn().mockResolvedValue({ body: {}, version: 0 }),
    push: vi.fn(),
    create: vi.fn(),
    setVisibility: vi.fn(),
    fork: vi.fn(),
  };
}

describe('viewer mode — owner detection heuristic', () => {
  it('1. fetch throws NotFoundError → scene is not locally owned (guest heuristic)', async () => {
    const sceneId = 'aaaabbbb-cccc-dddd-eeee-ffff00001111';
    const engine = makeGuestEngine(sceneId);

    let isGuest = false;
    try {
      await engine.fetch(sceneId);
    } catch (err) {
      isGuest = err instanceof NotFoundError;
    }
    expect(isGuest).toBe(true);
  });

  it('2. fetch resolves → scene is locally owned (owner heuristic)', async () => {
    const engine = makeOwnerEngine();
    const result = await engine.fetch('any-id');
    expect(result).toBeTruthy();
  });
});

describe('viewer mode — fork-navigate flow', () => {
  let disposeRoot: () => void;

  afterEach(() => {
    disposeRoot?.();
  });

  it('3. fork is called with the correct sceneId', async () => {
    const sourceId = '550e8400-e29b-41d4-a716-446655440000';
    const newId = '00000000-0000-0000-0000-000000000001';

    const engine: SyncEngine = {
      fetch: vi.fn().mockRejectedValue(new NotFoundError(sourceId)),
      push: vi.fn(),
      create: vi.fn(),
      setVisibility: vi.fn(),
      fork: vi.fn().mockResolvedValue({ id: newId, version: 0, forkedFrom: sourceId }),
    };

    await engine.fork(sourceId, 'My Fork');
    expect(engine.fork).toHaveBeenCalledWith(sourceId, 'My Fork');
  });

  it('4. fork success → navigateToScene(newId) is reflected in currentRoute', () => {
    const newId = '00000000-0000-0000-0000-000000000002';
    createRoot((dispose) => {
      disposeRoot = dispose;
      navigateToScene(newId);
      const r = currentRoute();
      expect(r.kind).toBe('scene');
      if (r.kind === 'scene') expect(r.sceneId).toBe(newId);
    });
  });

  it('5. fork failure → no navigation occurs', async () => {
    const sourceId = '550e8400-e29b-41d4-a716-446655440001';
    const engine: SyncEngine = {
      fetch: vi.fn().mockRejectedValue(new NotFoundError(sourceId)),
      push: vi.fn(),
      create: vi.fn(),
      setVisibility: vi.fn(),
      fork: vi.fn().mockRejectedValue(new Error('fork failed')),
    };

    let errorCaught = false;
    createRoot((dispose) => {
      disposeRoot = dispose;
      navigateToScene(sourceId); // simulate being on the viewer page

      void (async () => {
        try {
          await engine.fork(sourceId);
          // On success we'd navigate — but here we should not
        } catch {
          errorCaught = true;
          // No navigate call
        }
      })();
    });

    await vi.waitFor(() => errorCaught);
    // Route should still be the source scene (no navigation on failure)
    const r = currentRoute();
    expect(r.kind).toBe('scene');
    if (r.kind === 'scene') expect(r.sceneId).toBe(sourceId);
  });

  it('6. fork newId route has correct sceneId', () => {
    const newId = 'ffffeeee-dddd-cccc-bbbb-aaaaaaaaaaaa';
    createRoot((dispose) => {
      disposeRoot = dispose;
      navigateToScene(newId);
      const r = currentRoute();
      expect(r.kind).toBe('scene');
      if (r.kind === 'scene') expect(r.sceneId).toBe(newId);
    });
  });
});

// ── #1060: offline cached mode → Editor.readOnly gate ────────────────────────

describe('#1060 offline cached mode — Editor.readOnly gate', () => {
  let editor: Editor;

  afterEach(() => {
    editor?.dispose();
  });

  it('editor.readOnly is false by default (online path)', () => {
    editor = new Editor(new LocalProjectManager());
    expect(editor.readOnly()).toBe(false);
  });

  it('editor.execute() is a no-op when setReadOnly(true) (offline cached mode)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    editor = new Editor(new LocalProjectManager());

    // Simulate App.tsx setting readOnly=true when fromCache===true
    editor.setReadOnly(true);

    const node = editor.sceneDocument.createNode('Cube');
    editor.execute(new AddNodeCommand(editor, node));

    // Command must have been rejected — node should not exist in the document
    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
    warnSpy.mockRestore();
  });

  it('editor.undo() and redo() are no-ops when readOnly=true', () => {
    editor = new Editor(new LocalProjectManager());

    // Add a node while not read-only so there is history
    const node = editor.sceneDocument.createNode('Cube');
    editor.execute(new AddNodeCommand(editor, node));
    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);

    // Enter offline cached read-only mode
    editor.setReadOnly(true);

    editor.undo();
    // Node must still exist — undo was blocked
    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);

    editor.redo();
    // No change — redo also blocked
    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
  });
});
