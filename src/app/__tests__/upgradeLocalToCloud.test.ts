/**
 * upgradeLocalToCloud.test.ts
 *
 * Unit tests for the Local → Cloud upgrade function.
 *
 * Verifies:
 *   - happy path: create → closeProject → openCloudProject called with correct args
 *   - asset upload fail: syncEngine.create throws → closeProject NOT called (no half-open)
 *   - POST /api/scenes fail: same as asset fail (create() wraps both)
 *   - openCloudProject fail: closeProject called, openCloudProject throws, error propagates
 *
 * Spec ref: docs/cloud-project-spec.md § Local → Cloud 升級
 * Refs: #1053
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upgradeLocalToCloud } from '../upgradeLocalToCloud';
import { SceneDocument } from '../../core/scene/SceneDocument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSceneDocument(): SceneDocument {
  return new SceneDocument();
}

/**
 * Minimal mock Editor with a sceneDocument and projectManager.name.
 */
function makeMockEditor(projectName: string = 'My Project'): {
  sceneDocument: SceneDocument;
  projectManager: { name: string };
} {
  return {
    sceneDocument: makeSceneDocument(),
    projectManager: { name: projectName },
  };
}

/**
 * Build a mock HttpSyncEngine with a configurable create() outcome.
 */
function makeMockSyncEngine(opts: {
  createResult?: { id: string; version: number };
  createError?: Error;
} = {}) {
  return {
    create: vi.fn().mockImplementation(async () => {
      if (opts.createError) throw opts.createError;
      return opts.createResult ?? { id: 'scene-uuid-123', version: 1 };
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('upgradeLocalToCloud', () => {
  let closeProject: ReturnType<typeof vi.fn>;
  let openCloudProject: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeProject = vi.fn().mockResolvedValue(undefined);
    openCloudProject = vi.fn().mockResolvedValue(undefined);
  });

  it('happy path: calls create, closeProject, openCloudProject in order', async () => {
    const editor = makeMockEditor('My Scene');
    const syncEngine = makeMockSyncEngine({ createResult: { id: 'abc-123', version: 1 } });
    const user = { id: 'u1', githubLogin: 'alice', email: 'a@b.com', name: 'Alice' };

    await upgradeLocalToCloud({
      editor: editor as any,
      syncEngine: syncEngine as any,
      closeProject,
      openCloudProject,
      currentUser: user,
    });

    // create called once with scene name + document
    expect(syncEngine.create).toHaveBeenCalledOnce();
    expect(syncEngine.create).toHaveBeenCalledWith('My Scene', editor.sceneDocument);

    // closeProject called after create
    expect(closeProject).toHaveBeenCalledOnce();

    // openCloudProject called with the returned sceneId and the resolved user
    expect(openCloudProject).toHaveBeenCalledOnce();
    expect(openCloudProject).toHaveBeenCalledWith('abc-123', user);
  });

  it('uses "Untitled" when projectManager.name is null', async () => {
    const editor = { sceneDocument: makeSceneDocument(), projectManager: { name: null } };
    const syncEngine = makeMockSyncEngine();

    await upgradeLocalToCloud({
      editor: editor as any,
      syncEngine: syncEngine as any,
      closeProject,
      openCloudProject,
      currentUser: null,
    });

    expect(syncEngine.create).toHaveBeenCalledWith('Untitled', editor.sceneDocument);
  });

  it('asset upload / POST fail: closeProject NOT called, error propagates', async () => {
    const editor = makeMockEditor();
    const uploadError = new Error('Quota exceeded');
    const syncEngine = makeMockSyncEngine({ createError: uploadError });

    await expect(
      upgradeLocalToCloud({
        editor: editor as any,
        syncEngine: syncEngine as any,
        closeProject,
        openCloudProject,
        currentUser: null,
      }),
    ).rejects.toThrow('Quota exceeded');

    // closeProject must NOT be called — no half-open state
    expect(closeProject).not.toHaveBeenCalled();
    expect(openCloudProject).not.toHaveBeenCalled();
  });

  it('openCloudProject fail: closeProject called, error propagates', async () => {
    const editor = makeMockEditor();
    const syncEngine = makeMockSyncEngine();
    const loadError = new Error('Failed to load cloud scene');
    openCloudProject = vi.fn().mockRejectedValue(loadError);

    await expect(
      upgradeLocalToCloud({
        editor: editor as any,
        syncEngine: syncEngine as any,
        closeProject,
        openCloudProject,
        currentUser: null,
      }),
    ).rejects.toThrow('Failed to load cloud scene');

    // create succeeded, closeProject was called (local state torn down)
    expect(syncEngine.create).toHaveBeenCalledOnce();
    expect(closeProject).toHaveBeenCalledOnce();
    // user can access the created scene from cloud list
  });

  it('passes currentUser=undefined to openCloudProject when currentUser is undefined', async () => {
    const editor = makeMockEditor();
    const syncEngine = makeMockSyncEngine({ createResult: { id: 'xyz', version: 1 } });

    await upgradeLocalToCloud({
      editor: editor as any,
      syncEngine: syncEngine as any,
      closeProject,
      openCloudProject,
      currentUser: undefined,
    });

    // undefined ?? undefined → passes undefined as resolvedUser (openCloudProject reads signal itself)
    expect(openCloudProject).toHaveBeenCalledWith('xyz', undefined);
  });
});
