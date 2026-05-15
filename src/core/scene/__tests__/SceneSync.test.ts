import { describe, it, expect, beforeEach } from 'vitest';
import { Scene, Object3D, Group, Mesh, DirectionalLight, AmbientLight, PerspectiveCamera } from 'three';
import { SceneDocument } from '../SceneDocument';
import { SceneSync } from '../SceneSync';
import type { SceneNode } from '../SceneFormat';
import type { ResourceCache } from '../ResourceCache';
import { asNodeUUID } from '../../../utils/branded';

function makeNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: asNodeUUID('uuid-default'),
    name: 'node',
    parent: null,
    order: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    nodeType: 'group',
    userData: {},
    ...overrides,
  };
}

describe('SceneSync', () => {
  let doc: SceneDocument;
  let scene: Scene;
  let sync: SceneSync;

  beforeEach(() => {
    doc = new SceneDocument();
    scene = new Scene();
    sync = new SceneSync(doc, scene);
  });

  // ── addNode ──────────────────────────────────────────────────────────────

  describe('addNode → getObject3D', () => {
    it('creates Object3D and maps by UUID', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a'), name: 'Alpha' }));
      const obj = sync.getObject3D(asNodeUUID('a'));
      expect(obj).not.toBeNull();
      expect(obj!.name).toBe('Alpha');
    });

    it('adds root node to scene', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      expect(scene.children).toHaveLength(1);
    });

    it('applies position / rotation / scale', () => {
      doc.addNode(makeNode({
        id: asNodeUUID('a'),
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 2, 2],
      }));
      const obj = sync.getObject3D(asNodeUUID('a'))!;
      expect(obj.position.toArray()).toEqual([1, 2, 3]);
      expect(obj.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3]);
      expect(obj.scale.toArray()).toEqual([2, 2, 2]);
    });

    it('parent-child: parent added first', () => {
      doc.addNode(makeNode({ id: asNodeUUID('p'), name: 'Parent' }));
      doc.addNode(makeNode({ id: asNodeUUID('c'), name: 'Child', parent: asNodeUUID('p') }));

      const parentObj = sync.getObject3D(asNodeUUID('p'))!;
      const childObj = sync.getObject3D(asNodeUUID('c'))!;
      expect(childObj.parent).toBe(parentObj);
      expect(parentObj.children).toContain(childObj);
    });

    it('orphan: child added before parent → auto-reparent on parent add', () => {
      // Child first — parent does not exist yet
      doc.addNode(makeNode({ id: asNodeUUID('c'), name: 'Child', parent: asNodeUUID('p') }));
      const childObj = sync.getObject3D(asNodeUUID('c'))!;
      // Temporarily parked at scene root
      expect(childObj.parent).toBe(scene);

      // Now add parent
      doc.addNode(makeNode({ id: asNodeUUID('p'), name: 'Parent' }));
      const parentObj = sync.getObject3D(asNodeUUID('p'))!;
      // Child should have been moved under parent
      expect(childObj.parent).toBe(parentObj);
      expect(parentObj.children).toContain(childObj);
      // Scene root should only have the parent
      expect(scene.children).toHaveLength(1);
      expect(scene.children[0]).toBe(parentObj);
    });
  });

  // ── removeNode ───────────────────────────────────────────────────────────

  describe('removeNode', () => {
    it('removes Object3D from maps', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      doc.removeNode(asNodeUUID('a'));
      expect(sync.getObject3D(asNodeUUID('a'))).toBeNull();
    });

    it('removes Object3D from scene', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      doc.removeNode(asNodeUUID('a'));
      expect(scene.children).toHaveLength(0);
    });
  });

  // ── updateNode ───────────────────────────────────────────────────────────

  describe('updateNode', () => {
    it('updates position', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      doc.updateNode(asNodeUUID('a'), { position: [5, 6, 7] });
      expect(sync.getObject3D(asNodeUUID('a'))!.position.toArray()).toEqual([5, 6, 7]);
    });

    it('updates rotation', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      doc.updateNode(asNodeUUID('a'), { rotation: [0.5, 0.6, 0.7] });
      expect(sync.getObject3D(asNodeUUID('a'))!.rotation.toArray().slice(0, 3))
        .toEqual([0.5, 0.6, 0.7]);
    });

    it('updates scale', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      doc.updateNode(asNodeUUID('a'), { scale: [3, 3, 3] });
      expect(sync.getObject3D(asNodeUUID('a'))!.scale.toArray()).toEqual([3, 3, 3]);
    });

    it('updates name', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a'), name: 'old' }));
      doc.updateNode(asNodeUUID('a'), { name: 'new' });
      expect(sync.getObject3D(asNodeUUID('a'))!.name).toBe('new');
    });

    it('reparents on parent change', () => {
      doc.addNode(makeNode({ id: asNodeUUID('p1'), name: 'P1' }));
      doc.addNode(makeNode({ id: asNodeUUID('p2'), name: 'P2' }));
      doc.addNode(makeNode({ id: asNodeUUID('c'), name: 'Child', parent: asNodeUUID('p1') }));

      const p1 = sync.getObject3D(asNodeUUID('p1'))!;
      const p2 = sync.getObject3D(asNodeUUID('p2'))!;
      const child = sync.getObject3D(asNodeUUID('c'))!;
      expect(child.parent).toBe(p1);

      doc.updateNode(asNodeUUID('c'), { parent: asNodeUUID('p2') });
      expect(child.parent).toBe(p2);
      expect(p1.children).not.toContain(child);
      expect(p2.children).toContain(child);
    });

    it('moves to scene root when parent set to null', () => {
      doc.addNode(makeNode({ id: asNodeUUID('p') }));
      doc.addNode(makeNode({ id: asNodeUUID('c'), parent: asNodeUUID('p') }));

      doc.updateNode(asNodeUUID('c'), { parent: null });
      const child = sync.getObject3D(asNodeUUID('c'))!;
      expect(child.parent).toBe(scene);
    });
  });

  // ── rebuild ──────────────────────────────────────────────────────────────

  describe('rebuild', () => {
    it('reconstructs the full tree from document', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a'), name: 'A' }));
      doc.addNode(makeNode({ id: asNodeUUID('b'), name: 'B', parent: asNodeUUID('a') }));

      // Mess up the maps manually (simulate stale state)
      sync.rebuild();

      expect(sync.getObject3D(asNodeUUID('a'))).not.toBeNull();
      expect(sync.getObject3D(asNodeUUID('b'))).not.toBeNull();
      expect(sync.getObject3D(asNodeUUID('a'))!.name).toBe('A');
      expect(sync.getObject3D(asNodeUUID('b'))!.parent).toBe(sync.getObject3D(asNodeUUID('a')));
    });

    it('clears previous objects', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      const oldObj = sync.getObject3D(asNodeUUID('a'));

      sync.rebuild();
      const newObj = sync.getObject3D(asNodeUUID('a'));
      // Object3D instance should be different after rebuild
      expect(newObj).not.toBe(oldObj);
    });

    it('handles unordered nodes (child before parent in getAllNodes)', () => {
      // Directly add nodes so they exist in document
      doc.addNode(makeNode({ id: asNodeUUID('p'), name: 'Parent' }));
      doc.addNode(makeNode({ id: asNodeUUID('c'), name: 'Child', parent: asNodeUUID('p') }));

      // rebuild re-traverses — since getAllNodes order is not guaranteed,
      // the orphan logic inside onNodeAdded handles any ordering
      sync.rebuild();

      const parentObj = sync.getObject3D(asNodeUUID('p'))!;
      const childObj = sync.getObject3D(asNodeUUID('c'))!;
      expect(childObj.parent).toBe(parentObj);
    });
  });

  // ── sceneReplaced (deserialize) ──────────────────────────────────────────

  describe('sceneReplaced', () => {
    it('rebuilds on deserialize', () => {
      doc.addNode(makeNode({ id: asNodeUUID('old'), name: 'Old' }));
      expect(sync.getObject3D(asNodeUUID('old'))).not.toBeNull();

      doc.deserialize({
        version: 1,
        nodes: [makeNode({ id: asNodeUUID('new'), name: 'New' })],
      });

      expect(sync.getObject3D(asNodeUUID('old'))).toBeNull();
      expect(sync.getObject3D(asNodeUUID('new'))).not.toBeNull();
      expect(sync.getObject3D(asNodeUUID('new'))!.name).toBe('New');
    });
  });

  // ── getUUID ──────────────────────────────────────────────────────────────

  describe('getUUID', () => {
    it('returns UUID for known Object3D', () => {
      doc.addNode(makeNode({ id: asNodeUUID('xyz') }));
      const obj = sync.getObject3D(asNodeUUID('xyz'))!;
      expect(sync.getUUID(obj)).toBe('xyz');
    });

    it('returns null for unknown Object3D', () => {
      const stranger = new Object3D();
      expect(sync.getUUID(stranger)).toBeNull();
    });
  });

  // ── dispose ──────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('stops listening after dispose', () => {
      sync.dispose();

      doc.addNode(makeNode({ id: asNodeUUID('after-dispose') }));
      expect(sync.getObject3D(asNodeUUID('after-dispose'))).toBeNull();
    });

    it('clears maps', () => {
      doc.addNode(makeNode({ id: asNodeUUID('a') }));
      sync.dispose();
      expect(sync.getObject3D(asNodeUUID('a'))).toBeNull();
    });
  });

  // ── mesh component ───────────────────────────────────────────────────────────

  describe('nodeType mesh', () => {
    function makeMockCache(hit: boolean): ResourceCache {
      const meshObj = new Object3D();
      meshObj.name = 'cloned-mesh';
      return {
        has: () => hit,
        cloneSubtree: () => (hit ? meshObj.clone(true) : null),
        loadFromURL: async () => new Group(),
        evict: () => {},
        clear: () => {},
      } as unknown as ResourceCache;
    }

    it('cache hit: attaches cloned subtree as child of node Object3D', () => {
      const syncWithCache = new SceneSync(doc, scene, makeMockCache(true));
      doc.addNode(makeNode({
        id: asNodeUUID('mesh-node'),
        nodeType: 'mesh',
        asset: 'blob:test/1',
      }));
      const obj = syncWithCache.getObject3D(asNodeUUID('mesh-node'))!;
      expect(obj.children).toHaveLength(1);
      expect(obj.children[0].name).toBe('cloned-mesh');
    });

        it('cache miss: falls back to empty Object3D (no children)', () => {
      const syncWithCache = new SceneSync(doc, scene, makeMockCache(false));
      doc.addNode(makeNode({
        id: asNodeUUID('mesh-node'),
        nodeType: 'mesh',
        asset: 'blob:test/missing',
      }));
      const obj = syncWithCache.getObject3D(asNodeUUID('mesh-node'))!;
      expect(obj.children).toHaveLength(0);
    });

    it('asset not in cache (hydrate soft-fail): falls back to empty Object3D', () => {
      const syncWithCache = new SceneSync(doc, scene, makeMockCache(false));
      doc.addNode(makeNode({
        id: asNodeUUID('mesh-node'),
        // asset not in cache — hydrate soft-fail
        nodeType: 'mesh',
        asset: 'project://models/missing.glb',
      }));
      const obj = syncWithCache.getObject3D(asNodeUUID('mesh-node'))!;
      expect(obj.children).toHaveLength(0);
    });

    it('no mesh component: Object3D has no extra children', () => {
      const syncWithCache = new SceneSync(doc, scene, makeMockCache(true));
      doc.addNode(makeNode({ id: asNodeUUID('plain-node') }));
      const obj = syncWithCache.getObject3D(asNodeUUID('plain-node'))!;
      expect(obj.children).toHaveLength(0);
    });

    it('no resourceCache: node with mesh component still creates Object3D', () => {
      // sync (no cache) is the default created in beforeEach
      doc.addNode(makeNode({
        id: asNodeUUID('mesh-node'),
        nodeType: 'mesh',
        asset: 'blob:test/1',
      }));
      const obj = sync.getObject3D(asNodeUUID('mesh-node'));
      expect(obj).not.toBeNull();
      expect(obj!.children).toHaveLength(0);
    });
  });

  // ── geometry + material component ───────────────────────────────────────────

  describe('nodeType mesh (primitives)', () => {
    it('attaches a Mesh child to the entity Object3D (primitives:// scheme)', () => {
      doc.addNode(makeNode({
        id: asNodeUUID('geo-node'),
        nodeType: 'mesh',
        asset: 'primitives://box',
        mat: { color: 0xff0000 },
      }));
      const obj = sync.getObject3D(asNodeUUID('geo-node'))!;
      expect(obj.children).toHaveLength(1);
      expect(obj.children[0]).toBeInstanceOf(Mesh);
    });

    it('supports all geometry types without throwing', () => {
      for (const type of ['box', 'sphere', 'plane', 'cylinder'] as const) {
        doc.addNode(makeNode({
          id: asNodeUUID(`geo-${type}`),
          nodeType: 'mesh',
          asset: 'primitives://' + type,
          mat: { color: 0xffffff },
        }));
        const obj = sync.getObject3D(asNodeUUID(`geo-${type}`))!;
        expect(obj.children).toHaveLength(1);
      }
    });
  });

  // ── light component ──────────────────────────────────────────────────────────

  describe('nodeType light', () => {
    it('attaches DirectionalLight for type directional', () => {
      doc.addNode(makeNode({
        id: asNodeUUID('dir-light'),
        nodeType: 'light',
        light: { type: 'directional', color: 0xffffff, intensity: 1 },
      }));
      const obj = sync.getObject3D(asNodeUUID('dir-light'))!;
      expect(obj.children).toHaveLength(1);
      expect(obj.children[0]).toBeInstanceOf(DirectionalLight);
      expect((obj.children[0] as DirectionalLight).intensity).toBe(1);
    });

    it('attaches AmbientLight for type ambient', () => {
      doc.addNode(makeNode({
        id: asNodeUUID('amb-light'),
        nodeType: 'light',
        light: { type: 'ambient', color: 0x404040, intensity: 0.5 },
      }));
      const obj = sync.getObject3D(asNodeUUID('amb-light'))!;
      expect(obj.children).toHaveLength(1);
      expect(obj.children[0]).toBeInstanceOf(AmbientLight);
    });
  });

  // ── camera component ─────────────────────────────────────────────────────────

  describe('nodeType camera', () => {
    it('attaches PerspectiveCamera with correct fov', () => {
      doc.addNode(makeNode({
        id: asNodeUUID('cam-node'),
        nodeType: 'camera',
        camera: { type: 'perspective', fov: 50, near: 0.1, far: 100 },
      }));
      const obj = sync.getObject3D(asNodeUUID('cam-node'))!;
      expect(obj.children).toHaveLength(1);
      expect(obj.children[0]).toBeInstanceOf(PerspectiveCamera);
      expect((obj.children[0] as PerspectiveCamera).fov).toBe(50);
    });
  });
});
