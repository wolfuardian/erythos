import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scene } from 'three';
import { Editor } from '../Editor';
import { ProjectManager } from '../project/ProjectManager';

describe('Editor', () => {
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

  it('sceneDocument and sceneSync are initialized after construction', () => {
    expect(editor.sceneDocument).toBeDefined();
    expect(editor.sceneSync).toBeDefined();
  });

  it('threeScene getter returns the same Scene instance as editor.scene', () => {
    expect(editor.threeScene).toBeInstanceOf(Scene);
    expect(editor.threeScene).toBe(editor.scene);
  });

  it('addNode registers node in sceneDocument', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.addNode(node);
    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
  });

  it('addNode syncs node to Three.js via sceneSync', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.addNode(node);
    expect(editor.sceneSync.getObject3D(node.id)).not.toBeNull();
  });

  it('removeNode clears node from sceneDocument and sceneSync', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.addNode(node);
    editor.removeNode(node.id);
    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
    expect(editor.sceneSync.getObject3D(node.id)).toBeNull();
  });


  describe('loadScene — asset URL round-trip (F-1)', () => {
    it('loadScene does not mutate node.asset — project:// stays as project:// (v1 assets:// migrated)', async () => {
      // Stub AssetResolver.resolve to return a fake blob URL
      const fakeBlob = 'blob:http://localhost/fake-uuid';
      vi.spyOn(editor.assetResolver, 'resolve').mockResolvedValue(fakeBlob as any);
      // Stub ResourceCache.loadFromURL to no-op
      vi.spyOn(editor.resourceCache, 'loadFromURL').mockResolvedValue({} as any);

      const scene = {
        version: 1,
        env: { hdri: null, intensity: 1, rotation: 0 },
        nodes: [
          {
            id: 'node-1', name: 'Chair', parent: null, order: 0,
            nodeType: 'mesh', asset: 'assets://models/chair.glb',
            position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
            userData: {},
          },
        ],
      };

      await editor.loadScene(scene);

      // node.asset must NOT have been mutated to blob URL
      const node = editor.sceneDocument.getNode('node-1' as any);
      expect(node?.asset).toBe('project://models/chair.glb');
    });

    it('serialize after loadScene produces project:// URLs (not blob://)', async () => {
      // Stub AssetResolver.resolve to return a fake blob URL
      const fakeBlob = 'blob:http://localhost/fake-uuid';
      vi.spyOn(editor.assetResolver, 'resolve').mockResolvedValue(fakeBlob as any);
      vi.spyOn(editor.resourceCache, 'loadFromURL').mockResolvedValue({} as any);

      const scene = {
        version: 1,
        env: { hdri: null, intensity: 1, rotation: 0 },
        nodes: [
          {
            id: 'node-1', name: 'Chair', parent: null, order: 0,
            nodeType: 'mesh', asset: 'assets://models/chair.glb',
            position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
            userData: {},
          },
        ],
      };

      await editor.loadScene(scene);

      const serialized = editor.sceneDocument.serialize();
      const nodes = serialized.nodes;
      // No node asset should be a blob URL after serialize
      const blobNodes = nodes.filter(n => n.asset?.startsWith('blob:'));
      expect(blobNodes).toHaveLength(0);
      expect(nodes[0].asset).toBe('project://models/chair.glb');
    });
  });
});
