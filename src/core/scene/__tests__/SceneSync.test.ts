import { describe, it, expect, beforeEach } from 'vitest';
import { Scene, Object3D } from 'three';
import { SceneDocument } from '../SceneDocument';
import { SceneSync } from '../SceneSync';
import type { SceneNode } from '../SceneFormat';

function makeNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'uuid-default',
    name: 'node',
    parent: null,
    order: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    components: {},
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
      doc.addNode(makeNode({ id: 'a', name: 'Alpha' }));
      const obj = sync.getObject3D('a');
      expect(obj).not.toBeNull();
      expect(obj!.name).toBe('Alpha');
    });

    it('adds root node to scene', () => {
      doc.addNode(makeNode({ id: 'a' }));
      expect(scene.children).toHaveLength(1);
    });

    it('applies position / rotation / scale', () => {
      doc.addNode(makeNode({
        id: 'a',
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 2, 2],
      }));
      const obj = sync.getObject3D('a')!;
      expect(obj.position.toArray()).toEqual([1, 2, 3]);
      expect(obj.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3]);
      expect(obj.scale.toArray()).toEqual([2, 2, 2]);
    });

    it('parent-child: parent added first', () => {
      doc.addNode(makeNode({ id: 'p', name: 'Parent' }));
      doc.addNode(makeNode({ id: 'c', name: 'Child', parent: 'p' }));

      const parentObj = sync.getObject3D('p')!;
      const childObj = sync.getObject3D('c')!;
      expect(childObj.parent).toBe(parentObj);
      expect(parentObj.children).toContain(childObj);
    });

    it('orphan: child added before parent → auto-reparent on parent add', () => {
      // Child first — parent does not exist yet
      doc.addNode(makeNode({ id: 'c', name: 'Child', parent: 'p' }));
      const childObj = sync.getObject3D('c')!;
      // Temporarily parked at scene root
      expect(childObj.parent).toBe(scene);

      // Now add parent
      doc.addNode(makeNode({ id: 'p', name: 'Parent' }));
      const parentObj = sync.getObject3D('p')!;
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
      doc.addNode(makeNode({ id: 'a' }));
      doc.removeNode('a');
      expect(sync.getObject3D('a')).toBeNull();
    });

    it('removes Object3D from scene', () => {
      doc.addNode(makeNode({ id: 'a' }));
      doc.removeNode('a');
      expect(scene.children).toHaveLength(0);
    });
  });

  // ── updateNode ───────────────────────────────────────────────────────────

  describe('updateNode', () => {
    it('updates position', () => {
      doc.addNode(makeNode({ id: 'a' }));
      doc.updateNode('a', { position: [5, 6, 7] });
      expect(sync.getObject3D('a')!.position.toArray()).toEqual([5, 6, 7]);
    });

    it('updates rotation', () => {
      doc.addNode(makeNode({ id: 'a' }));
      doc.updateNode('a', { rotation: [0.5, 0.6, 0.7] });
      expect(sync.getObject3D('a')!.rotation.toArray().slice(0, 3))
        .toEqual([0.5, 0.6, 0.7]);
    });

    it('updates scale', () => {
      doc.addNode(makeNode({ id: 'a' }));
      doc.updateNode('a', { scale: [3, 3, 3] });
      expect(sync.getObject3D('a')!.scale.toArray()).toEqual([3, 3, 3]);
    });

    it('updates name', () => {
      doc.addNode(makeNode({ id: 'a', name: 'old' }));
      doc.updateNode('a', { name: 'new' });
      expect(sync.getObject3D('a')!.name).toBe('new');
    });

    it('reparents on parent change', () => {
      doc.addNode(makeNode({ id: 'p1', name: 'P1' }));
      doc.addNode(makeNode({ id: 'p2', name: 'P2' }));
      doc.addNode(makeNode({ id: 'c', name: 'Child', parent: 'p1' }));

      const p1 = sync.getObject3D('p1')!;
      const p2 = sync.getObject3D('p2')!;
      const child = sync.getObject3D('c')!;
      expect(child.parent).toBe(p1);

      doc.updateNode('c', { parent: 'p2' });
      expect(child.parent).toBe(p2);
      expect(p1.children).not.toContain(child);
      expect(p2.children).toContain(child);
    });

    it('moves to scene root when parent set to null', () => {
      doc.addNode(makeNode({ id: 'p' }));
      doc.addNode(makeNode({ id: 'c', parent: 'p' }));

      doc.updateNode('c', { parent: null });
      const child = sync.getObject3D('c')!;
      expect(child.parent).toBe(scene);
    });
  });

  // ── rebuild ──────────────────────────────────────────────────────────────

  describe('rebuild', () => {
    it('reconstructs the full tree from document', () => {
      doc.addNode(makeNode({ id: 'a', name: 'A' }));
      doc.addNode(makeNode({ id: 'b', name: 'B', parent: 'a' }));

      // Mess up the maps manually (simulate stale state)
      sync.rebuild();

      expect(sync.getObject3D('a')).not.toBeNull();
      expect(sync.getObject3D('b')).not.toBeNull();
      expect(sync.getObject3D('a')!.name).toBe('A');
      expect(sync.getObject3D('b')!.parent).toBe(sync.getObject3D('a'));
    });

    it('clears previous objects', () => {
      doc.addNode(makeNode({ id: 'a' }));
      const oldObj = sync.getObject3D('a');

      sync.rebuild();
      const newObj = sync.getObject3D('a');
      // Object3D instance should be different after rebuild
      expect(newObj).not.toBe(oldObj);
    });

    it('handles unordered nodes (child before parent in getAllNodes)', () => {
      // Directly add nodes so they exist in document
      doc.addNode(makeNode({ id: 'p', name: 'Parent' }));
      doc.addNode(makeNode({ id: 'c', name: 'Child', parent: 'p' }));

      // rebuild re-traverses — since getAllNodes order is not guaranteed,
      // the orphan logic inside onNodeAdded handles any ordering
      sync.rebuild();

      const parentObj = sync.getObject3D('p')!;
      const childObj = sync.getObject3D('c')!;
      expect(childObj.parent).toBe(parentObj);
    });
  });

  // ── sceneReplaced (deserialize) ──────────────────────────────────────────

  describe('sceneReplaced', () => {
    it('rebuilds on deserialize', () => {
      doc.addNode(makeNode({ id: 'old', name: 'Old' }));
      expect(sync.getObject3D('old')).not.toBeNull();

      doc.deserialize({
        version: 1,
        nodes: [makeNode({ id: 'new', name: 'New' })],
      });

      expect(sync.getObject3D('old')).toBeNull();
      expect(sync.getObject3D('new')).not.toBeNull();
      expect(sync.getObject3D('new')!.name).toBe('New');
    });
  });

  // ── getUUID ──────────────────────────────────────────────────────────────

  describe('getUUID', () => {
    it('returns UUID for known Object3D', () => {
      doc.addNode(makeNode({ id: 'xyz' }));
      const obj = sync.getObject3D('xyz')!;
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

      doc.addNode(makeNode({ id: 'after-dispose' }));
      expect(sync.getObject3D('after-dispose')).toBeNull();
    });

    it('clears maps', () => {
      doc.addNode(makeNode({ id: 'a' }));
      sync.dispose();
      expect(sync.getObject3D('a')).toBeNull();
    });
  });
});
