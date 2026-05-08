import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { SaveAsPrefabCommand } from '../commands/SaveAsPrefabCommand';
import { ProjectManager } from '../project/ProjectManager';
import type { SceneNode } from '../scene/SceneFormat';
import type { NodeUUID } from '../../utils/branded';

function makeNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'root-uuid' as NodeUUID,
    name: 'TestNode',
    parent: null,
    order: 0,
    nodeType: 'group',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    userData: {},
    ...overrides,
  };
}

describe('SaveAsPrefabCommand', () => {
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

  describe('undo snapshot — F-3', () => {
    it('undo restores group node correctly (not hardcoded mesh)', () => {
      const node = makeNode({ id: 'root-uuid' as NodeUUID, nodeType: 'group' });
      editor.sceneDocument.addNode(node);

      const cmd = new SaveAsPrefabCommand(editor, 'root-uuid' as NodeUUID, 'my-group');
      editor.execute(cmd);

      // After execute: node should be prefab
      expect(editor.sceneDocument.getNode('root-uuid' as NodeUUID)?.nodeType).toBe('prefab');

      editor.undo();

      // After undo: node should be restored to group
      const restored = editor.sceneDocument.getNode('root-uuid' as NodeUUID);
      expect(restored?.nodeType).toBe('group');
      expect(restored?.asset).toBeUndefined();
    });

    it('undo restores mesh node with original asset', () => {
      const node = makeNode({
        id: 'root-uuid' as NodeUUID,
        nodeType: 'mesh',
        asset: 'project://models/chair.glb',
      });
      editor.sceneDocument.addNode(node);

      const cmd = new SaveAsPrefabCommand(editor, 'root-uuid' as NodeUUID, 'my-mesh');
      editor.execute(cmd);

      expect(editor.sceneDocument.getNode('root-uuid' as NodeUUID)?.nodeType).toBe('prefab');

      editor.undo();

      const restored = editor.sceneDocument.getNode('root-uuid' as NodeUUID);
      expect(restored?.nodeType).toBe('mesh');
      expect(restored?.asset).toBe('project://models/chair.glb');
    });

    it('undo restores light node with light props', () => {
      const lightProps = { type: 'directional' as const, color: 0xffffff, intensity: 1.5 };
      const node = makeNode({
        id: 'root-uuid' as NodeUUID,
        nodeType: 'light',
        light: lightProps,
      });
      editor.sceneDocument.addNode(node);

      const cmd = new SaveAsPrefabCommand(editor, 'root-uuid' as NodeUUID, 'my-light');
      editor.execute(cmd);

      expect(editor.sceneDocument.getNode('root-uuid' as NodeUUID)?.nodeType).toBe('prefab');

      editor.undo();

      const restored = editor.sceneDocument.getNode('root-uuid' as NodeUUID);
      expect(restored?.nodeType).toBe('light');
      expect(restored?.light).toEqual(lightProps);
      expect(restored?.asset).toBeUndefined();
    });

    it('execute → undo → redo restores prefab state correctly', () => {
      const node = makeNode({ id: 'root-uuid' as NodeUUID, nodeType: 'group' });
      editor.sceneDocument.addNode(node);

      const cmd = new SaveAsPrefabCommand(editor, 'root-uuid' as NodeUUID, 'my-group');
      editor.execute(cmd);
      editor.undo();
      editor.redo();

      // After redo: should be prefab again
      expect(editor.sceneDocument.getNode('root-uuid' as NodeUUID)?.nodeType).toBe('prefab');
    });
  });
});
