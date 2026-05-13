import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scene } from 'three';
import { Editor } from '../Editor';
import { LocalProjectManager as ProjectManager } from '../project/LocalProjectManager';
import { AddNodeCommand } from '../commands/AddNodeCommand';
import type { PrefabAsset } from '../scene/PrefabFormat';

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

  // ── readOnly enforcement ──────────────────────────
  describe('readOnly enforcement', () => {
    it('readOnly defaults to false', () => {
      expect(editor.readOnly()).toBe(false);
    });

    it('execute() runs command when readOnly=false', () => {
      const node = editor.sceneDocument.createNode('Cube');
      editor.execute(new AddNodeCommand(editor, node));
      expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
    });

    it('execute() is a no-op and warns when readOnly=true', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      editor.setReadOnly(true);
      const node = editor.sceneDocument.createNode('Cube');
      editor.execute(new AddNodeCommand(editor, node));
      expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        'Editor is read-only — command rejected:',
        'AddNodeCommand',
      );
      warnSpy.mockRestore();
    });

    it('undo() is a no-op when readOnly=true', () => {
      // Set up: add a node first
      const node = editor.sceneDocument.createNode('Cube');
      editor.execute(new AddNodeCommand(editor, node));
      expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
      // Now switch to readOnly and try to undo
      editor.setReadOnly(true);
      editor.undo();
      // Node should still be there (undo was a no-op)
      expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
    });

    it('redo() is a no-op when readOnly=true', () => {
      const node = editor.sceneDocument.createNode('Cube');
      editor.execute(new AddNodeCommand(editor, node));
      editor.undo(); // undo while not readOnly so redo would be available
      editor.setReadOnly(true);
      editor.redo();
      // Node should still be absent (redo was a no-op)
      expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
    });

    it('setReadOnly is reactive — can toggle back to false', () => {
      editor.setReadOnly(true);
      expect(editor.readOnly()).toBe(true);
      editor.setReadOnly(false);
      expect(editor.readOnly()).toBe(false);
      // Command should work again
      const node = editor.sceneDocument.createNode('Cube');
      editor.execute(new AddNodeCommand(editor, node));
      expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
    });
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

  // ── registerPrefab race guard (issue #753) ────────────────────────────────────
  describe('registerPrefab race guard — F-753', () => {
    const minimalPrefab = (name: string): PrefabAsset => ({
      version: 1,
      id: 'pref-id' as any,
      name,
      modified: '2025-01-01T00:00:00Z',
      nodes: [
        {
          localId: 0,
          parentLocalId: null,
          name: 'Root',
          order: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          components: { geometry: { type: 'box' } },
        },
      ],
    });

    it('registerPrefab sync-caches asset by path before async write completes', () => {
      // Stall the async writeFile so the IIFE is suspended mid-await
      vi.spyOn(editor.projectManager, 'writeFile').mockReturnValue(
        new Promise<void>(() => { /* intentionally never resolves */ }),
      );

      const asset = minimalPrefab('chair');
      const path = editor.registerPrefab(asset);

      // Synchronously after registerPrefab returns, the asset must be retrievable
      // by path even though writeFile hasn't resolved yet.
      expect(editor.prefabRegistry.getAssetByPath(path)).toBe(asset);
    });

    it('once write completes, URL-keyed entry replaces pre-write entry', async () => {
      let resolveWrite!: () => void;
      vi.spyOn(editor.projectManager, 'writeFile').mockReturnValue(
        new Promise<void>(res => { resolveWrite = res; }),
      );
      const fakeURL = 'blob:fake/chair-url' as any;
      vi.spyOn(editor.projectManager, 'urlFor').mockResolvedValue(fakeURL);
      vi.spyOn(editor.projectManager, 'rescan').mockResolvedValue(undefined);

      const asset = minimalPrefab('chair');
      const path = editor.registerPrefab(asset);

      // Pre-write entry present before write resolves
      expect(editor.prefabRegistry.getAssetByPath(path)).not.toBeNull();

      // Resolve the write
      resolveWrite();
      // Drain microtasks
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // After write + urlFor complete, URL-keyed entry must exist
      expect(editor.prefabRegistry.getURLForPath(path)).toBe(fakeURL);
      expect(editor.prefabRegistry.get(fakeURL)).toBe(asset);
      // Pre-write entry must be cleared (promoted to URL-keyed)
      expect(editor.prefabRegistry.getAssetByPath(path)).toBeNull();
    });

    it('pre-write entry allows SceneSync to hydrate a just-registered prefab node', () => {
      // Stall write so IIFE never resolves during this test
      vi.spyOn(editor.projectManager, 'writeFile').mockReturnValue(new Promise(() => {}));

      const asset = minimalPrefab('chair');
      editor.registerPrefab(asset);
      // "prefabs/chair.prefab" → "prefabs://chair"
      const prefabUrl = 'prefabs://chair';

      // Add a prefab node referencing the just-registered prefab
      const node = editor.sceneDocument.createNode('ChairInstance');
      editor.sceneDocument.addNode({
        ...node,
        nodeType: 'prefab',
        asset: prefabUrl,
      });

      // SceneSync.hydratePrefab must succeed: node should NOT be in brokenRefIds
      expect(editor.sceneSync.getBrokenRefIds().has(node.id)).toBe(false);
    });

    it('writeFile failure clears pre-write entry (no zombie state)', async () => {
      vi.spyOn(editor.projectManager, 'writeFile').mockRejectedValue(new Error('disk full'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const asset = minimalPrefab('chair');
      const path = editor.registerPrefab(asset);

      // Pre-write entry exists synchronously after registerPrefab returns
      expect(editor.prefabRegistry.getAssetByPath(path)).toBe(asset);

      // Drain microtasks until the catch block runs (writeFile reject → catch → evictByPath)
      await Promise.resolve();
      await Promise.resolve();

      // Pre-write entry must be cleared after failure — no zombie state
      expect(editor.prefabRegistry.getAssetByPath(path)).toBeNull();

      warnSpy.mockRestore();
    });
  });
});
