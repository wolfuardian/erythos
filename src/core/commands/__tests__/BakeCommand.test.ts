/**
 * BakeCommand unit tests
 *
 * We test the command in isolation using a minimal editor mock:
 *   - Real SceneDocument (so addNode/removeNode/getAllNodes work authentically)
 *   - Minimal PrefabRegistry mock (synchronous get/getURLForPath/getAssetByPath)
 *   - Minimal Editor stub with sceneDocument + prefabRegistry + history.execute
 *
 * We do NOT use a full Editor instance since Editor requires a ProjectManager
 * and Three.js Scene setup which are unnecessary for pure command logic tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BakeCommand } from '../BakeCommand';
import { SceneDocument } from '../../scene/SceneDocument';
import { PrefabRegistry } from '../../scene/PrefabRegistry';
import type { PrefabAsset } from '../../scene/PrefabFormat';
import type { SceneNode } from '../../scene/SceneFormat';
import { asNodeUUID, asAssetPath, asPrefabId } from '../../../utils/branded';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSceneNode(id: string, overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: asNodeUUID(id),
    name: id,
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

/**
 * Build a minimal PrefabAsset for use in tests.
 * nodes: array of { name, parentLocalId, components? }
 */
function makePrefabAsset(name: string, nodes: Array<{
  name: string;
  parentLocalId: number | null;
  components?: Record<string, unknown>;
}>): PrefabAsset {
  return {
    version: 1,
    id: asPrefabId(`prefab-${name}`),
    name,
    modified: '2024-01-01T00:00:00.000Z',
    nodes: nodes.map((n, i) => ({
      localId: i,
      parentLocalId: n.parentLocalId,
      name: n.name,
      order: i,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      components: n.components ?? {},
    })),
  };
}

/**
 * Build a minimal Editor stub with a real SceneDocument and real PrefabRegistry.
 * BakeCommand only uses: editor.sceneDocument, editor.prefabRegistry.
 */
function makeEditorStub(doc: SceneDocument, registry: PrefabRegistry) {
  return {
    sceneDocument: doc,
    prefabRegistry: registry,
    // Minimal stubs for other Editor properties not used by BakeCommand:
    selection: { select: () => {}, clear: () => {} },
    execute(cmd: { execute(): void }) { cmd.execute(); },
  } as unknown as ConstructorParameters<typeof BakeCommand>[0];
}

/**
 * Register a prefab asset with the registry under the canonical path format.
 * "prefabs://chair" → path "prefabs/chair.prefab"
 */
function registerPrefab(registry: PrefabRegistry, prefabsUrl: string, asset: PrefabAsset): void {
  const name = prefabsUrl.replace('prefabs://', '');
  const path = asAssetPath(`prefabs/${name}.prefab`);
  // Use setAssetByPath (pre-write path-keyed entry) for test convenience
  registry.setAssetByPath(path, asset);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BakeCommand', () => {
  let doc: SceneDocument;
  let registry: PrefabRegistry;

  beforeEach(() => {
    doc = new SceneDocument();
    registry = new PrefabRegistry();
  });

  // ── Happy path: single-root prefab ─────────────────────────────────────────

  describe('happy path — single-root prefab', () => {
    it('baked nodes appear in getAllNodes()', () => {
      const asset = makePrefabAsset('chair', [
        { name: 'Chair', parentLocalId: null },
        { name: 'Seat',  parentLocalId: 0 },
        { name: 'Back',  parentLocalId: 0 },
      ]);
      registerPrefab(registry, 'prefabs://chair', asset);

      const instance = makeSceneNode('instance-1', {
        nodeType: 'prefab',
        asset: 'prefabs://chair',
        position: [1, 2, 3],
      });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, instance.id);
      cmd.execute();

      const all = doc.getAllNodes();
      // Instance node is gone; 3 baked nodes appeared
      expect(doc.getNode(instance.id)).toBeNull();
      expect(all).toHaveLength(3);
      expect(all.map(n => n.name)).toEqual(expect.arrayContaining(['Chair', 'Seat', 'Back']));
    });

    it('baked root inherits instance parent and position', () => {
      const parentNode = makeSceneNode('parent-node');
      doc.addNode(parentNode);

      const asset = makePrefabAsset('chair', [
        { name: 'Chair', parentLocalId: null },
      ]);
      registerPrefab(registry, 'prefabs://chair', asset);

      const instance = makeSceneNode('instance-1', {
        nodeType: 'prefab',
        asset: 'prefabs://chair',
        parent: asNodeUUID('parent-node'),
        order: 5,
        position: [10, 20, 30],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 2, 2],
      });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      new BakeCommand(editor, instance.id).execute();

      const bakedRoot = doc.getAllNodes().find(n => n.name === 'Chair')!;
      expect(bakedRoot).toBeDefined();
      expect(bakedRoot.parent).toBe('parent-node');
      expect(bakedRoot.order).toBe(5);
      expect(bakedRoot.position).toEqual([10, 20, 30]);
      expect(bakedRoot.rotation).toEqual([0.1, 0.2, 0.3]);
      expect(bakedRoot.scale).toEqual([2, 2, 2]);
    });

    it('baked nodes have new UUIDs — not the prefab localId strings', () => {
      const asset = makePrefabAsset('chair', [
        { name: 'Chair', parentLocalId: null },
        { name: 'Seat',  parentLocalId: 0 },
      ]);
      registerPrefab(registry, 'prefabs://chair', asset);

      const instance = makeSceneNode('instance-1', { nodeType: 'prefab', asset: 'prefabs://chair' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      new BakeCommand(editor, instance.id).execute();

      const all = doc.getAllNodes();
      // None of the baked nodes should have id matching instance or '0', '1' etc.
      for (const n of all) {
        expect(n.id).not.toBe('instance-1');
        expect(n.id).not.toBe('0');
        expect(n.id).not.toBe('1');
      }
    });

    it('parent-child relationship is preserved among baked nodes', () => {
      const asset = makePrefabAsset('chair', [
        { name: 'Root',  parentLocalId: null },
        { name: 'Child', parentLocalId: 0 },
      ]);
      registerPrefab(registry, 'prefabs://chair', asset);

      const instance = makeSceneNode('instance-1', { nodeType: 'prefab', asset: 'prefabs://chair' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      new BakeCommand(editor, instance.id).execute();

      const all = doc.getAllNodes();
      const rootNode  = all.find(n => n.name === 'Root')!;
      const childNode = all.find(n => n.name === 'Child')!;
      expect(rootNode).toBeDefined();
      expect(childNode).toBeDefined();
      expect(childNode.parent).toBe(rootNode.id);
    });
  });

  // ── Original prefab not modified ──────────────────────────────────────────

  describe('original prefab unchanged', () => {
    it('PrefabRegistry still holds the original asset after bake', () => {
      const asset = makePrefabAsset('chair', [
        { name: 'Chair', parentLocalId: null },
      ]);
      registerPrefab(registry, 'prefabs://chair', asset);

      const instance = makeSceneNode('instance-1', { nodeType: 'prefab', asset: 'prefabs://chair' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      new BakeCommand(editor, instance.id).execute();

      // Asset in registry is unchanged
      const path = asAssetPath('prefabs/chair.prefab');
      const retrieved = registry.getAssetByPath(path);
      expect(retrieved).toBe(asset);
      expect(retrieved?.nodes).toHaveLength(1);
    });
  });

  // ── Undo ──────────────────────────────────────────────────────────────────

  describe('undo', () => {
    it('undo restores original prefab instance and removes baked nodes', () => {
      const asset = makePrefabAsset('chair', [
        { name: 'Chair', parentLocalId: null },
        { name: 'Seat',  parentLocalId: 0 },
      ]);
      registerPrefab(registry, 'prefabs://chair', asset);

      const instance = makeSceneNode('instance-1', { nodeType: 'prefab', asset: 'prefabs://chair' });
      doc.addNode(instance);
      expect(doc.getAllNodes()).toHaveLength(1);

      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, instance.id);
      cmd.execute();
      expect(doc.getAllNodes()).toHaveLength(2); // Chair + Seat

      cmd.undo();

      // Back to original state: only the prefab instance
      expect(doc.getAllNodes()).toHaveLength(1);
      const restored = doc.getNode(instance.id);
      expect(restored).not.toBeNull();
      expect(restored!.nodeType).toBe('prefab');
      expect(restored!.asset).toBe('prefabs://chair');
    });

    it('undo after multi-node bake removes all baked nodes', () => {
      const asset = makePrefabAsset('tree', [
        { name: 'Root',  parentLocalId: null },
        { name: 'Trunk', parentLocalId: 0 },
        { name: 'Left',  parentLocalId: 1 },
        { name: 'Right', parentLocalId: 1 },
      ]);
      registerPrefab(registry, 'prefabs://tree', asset);

      const instance = makeSceneNode('tree-inst', { nodeType: 'prefab', asset: 'prefabs://tree' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, asNodeUUID('tree-inst'));
      cmd.execute();
      expect(doc.getAllNodes()).toHaveLength(4);

      cmd.undo();
      expect(doc.getAllNodes()).toHaveLength(1);
      expect(doc.getNode(asNodeUUID('tree-inst'))).not.toBeNull();
    });

    it('redo after undo works correctly', () => {
      const asset = makePrefabAsset('box', [
        { name: 'Box',  parentLocalId: null },
        { name: 'Face', parentLocalId: 0 },
      ]);
      registerPrefab(registry, 'prefabs://box', asset);

      const instance = makeSceneNode('box-inst', { nodeType: 'prefab', asset: 'prefabs://box' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, asNodeUUID('box-inst'));

      // Execute → undo → execute again (redo)
      cmd.execute();
      expect(doc.getAllNodes()).toHaveLength(2);

      cmd.undo();
      expect(doc.getAllNodes()).toHaveLength(1);
      expect(doc.getNode(asNodeUUID('box-inst'))).not.toBeNull();

      cmd.execute();
      expect(doc.getAllNodes()).toHaveLength(2);
      expect(doc.getNode(asNodeUUID('box-inst'))).toBeNull();
    });

    it('redo produces the same node UUIDs as the first execute (UUID stability)', () => {
      const asset = makePrefabAsset('stable', [
        { name: 'Root',  parentLocalId: null },
        { name: 'Child', parentLocalId: 0 },
      ]);
      registerPrefab(registry, 'prefabs://stable', asset);

      const instance = makeSceneNode('stable-inst', { nodeType: 'prefab', asset: 'prefabs://stable' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, asNodeUUID('stable-inst'));

      // First execute: capture UUIDs
      cmd.execute();
      const idsBefore = doc.getAllNodes().map(n => n.id).sort();

      // Undo → redo
      cmd.undo();
      cmd.execute();
      const idsAfter = doc.getAllNodes().map(n => n.id).sort();

      // UUIDs must be identical — redo reuses cached nodes, not freshly minted ones
      expect(idsAfter).toEqual(idsBefore);
    });
  });

  // ── Nested prefab not recursed ────────────────────────────────────────────

  describe('nested prefab — not recursed', () => {
    it('inner prefab nodes remain as prefab nodeType after bake', () => {
      // A prefab whose second node is itself a nested prefab reference
      const asset = makePrefabAsset('complex', [
        { name: 'Root',   parentLocalId: null },
        { name: 'Nested', parentLocalId: 0, components: { prefab: { asset: 'prefabs://inner' } } },
      ]);
      registerPrefab(registry, 'prefabs://complex', asset);

      const instance = makeSceneNode('inst', { nodeType: 'prefab', asset: 'prefabs://complex' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      new BakeCommand(editor, asNodeUUID('inst')).execute();

      const nestedNode = doc.getAllNodes().find(n => n.name === 'Nested')!;
      expect(nestedNode).toBeDefined();
      // Should be nodeType: 'prefab' (not recursively baked)
      expect(nestedNode.nodeType).toBe('prefab');
      expect(nestedNode.asset).toBe('prefabs://inner');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('throws if node not found', () => {
      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, asNodeUUID('nonexistent'));
      expect(() => cmd.execute()).toThrow(/not found/);
    });

    it('throws if node is not a prefab', () => {
      const node = makeSceneNode('mesh-node', { nodeType: 'mesh' });
      doc.addNode(node);

      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, asNodeUUID('mesh-node'));
      expect(() => cmd.execute()).toThrow(/not a prefab instance/);
    });

    it('throws if prefab asset not in registry', () => {
      const instance = makeSceneNode('instance-1', { nodeType: 'prefab', asset: 'prefabs://missing' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      const cmd = new BakeCommand(editor, instance.id);
      expect(() => cmd.execute()).toThrow(/not found in registry/);
    });

    it('handles empty prefab gracefully — instance removed, nothing added', () => {
      const emptyAsset: PrefabAsset = {
        version: 1,
        id: asPrefabId('empty-id'),
        name: 'empty',
        modified: '2024-01-01T00:00:00.000Z',
        nodes: [],
      };
      registerPrefab(registry, 'prefabs://empty', emptyAsset);

      const instance = makeSceneNode('inst', { nodeType: 'prefab', asset: 'prefabs://empty' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      new BakeCommand(editor, instance.id).execute();

      expect(doc.getAllNodes()).toHaveLength(0);
    });

    it('bake mesh components are correctly resolved (geometry → mesh nodeType)', () => {
      const asset = makePrefabAsset('prim', [
        { name: 'Box', parentLocalId: null, components: { geometry: { type: 'box' } } },
      ]);
      registerPrefab(registry, 'prefabs://prim', asset);

      const instance = makeSceneNode('inst', { nodeType: 'prefab', asset: 'prefabs://prim' });
      doc.addNode(instance);

      const editor = makeEditorStub(doc, registry);
      new BakeCommand(editor, instance.id).execute();

      const baked = doc.getAllNodes()[0];
      expect(baked).toBeDefined();
      expect(baked.nodeType).toBe('mesh');
      expect(baked.asset).toBe('project://primitives/box');
    });
  });
});
