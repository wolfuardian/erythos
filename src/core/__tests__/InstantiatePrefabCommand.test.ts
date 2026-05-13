import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { InstantiatePrefabCommand } from '../commands/InstantiatePrefabCommand';
import { CircularReferenceError } from '../commands/InstantiatePrefabCommand';
import { LocalProjectManager as ProjectManager } from '../project/LocalProjectManager';
import type { AssetPath } from '../../utils/branded';

describe('InstantiatePrefabCommand cycle guard', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor(new ProjectManager());
  });

  afterEach(() => {
    editor.dispose();
    vi.useRealTimers();
  });

  it('execute succeeds when no cycle exists (empty graph)', () => {
    const cmd = new InstantiatePrefabCommand(editor, 'prefabs/chair.prefab' as AssetPath);
    expect(() => editor.execute(cmd)).not.toThrow();
  });

  it('execute does NOT throw when prefabGraph has no relevant edges', () => {
    // Add some unrelated edges
    editor.prefabGraph.addEdge('prefabs://table', 'prefabs://leg');
    const cmd = new InstantiatePrefabCommand(editor, 'prefabs/chair.prefab' as AssetPath);
    expect(() => editor.execute(cmd)).not.toThrow();
  });

  it('execute throws CircularReferenceError when graph indicates cycle', () => {
    // Simulate: current scene path is "scenes/room.scene"
    // prefab "chair" depends on "scenes/room.scene" (hypothetical cycle)
    const currentPath = editor.projectManager.currentScenePath();
    editor.prefabGraph.addEdge('prefabs://chair', currentPath);
    // Now instantiating chair into room.scene would create: room.scene -> chair -> room.scene
    const cmd = new InstantiatePrefabCommand(editor, 'prefabs/chair.prefab' as AssetPath);
    expect(() => editor.execute(cmd)).toThrow(CircularReferenceError);
  });

  it('undo stack is NOT modified when execute throws', () => {
    const currentPath = editor.projectManager.currentScenePath();
    editor.prefabGraph.addEdge('prefabs://chair', currentPath);
    const cmd = new InstantiatePrefabCommand(editor, 'prefabs/chair.prefab' as AssetPath);
    try { editor.execute(cmd); } catch { /* expected */ }
    expect(editor.history.canUndo).toBe(false);
  });

  it('undo removes the node when execute succeeds', () => {
    const cmd = new InstantiatePrefabCommand(editor, 'prefabs/chair.prefab' as AssetPath);
    editor.execute(cmd);
    expect(editor.sceneDocument.getAllNodes()).toHaveLength(1);
    editor.undo();
    expect(editor.sceneDocument.getAllNodes()).toHaveLength(0);
  });
});
