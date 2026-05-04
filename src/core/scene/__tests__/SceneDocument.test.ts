import { describe, it, expect, vi } from 'vitest';
import { SceneDocument } from '../SceneDocument';
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

describe('SceneDocument', () => {
  describe('addNode / getNode', () => {
    it('stores and retrieves a node by UUID', () => {
      const doc = new SceneDocument();
      const node = makeNode({ id: 'abc' });
      doc.addNode(node);
      expect(doc.getNode('abc')).toBe(node);
    });

    it('emits nodeAdded', () => {
      const doc = new SceneDocument();
      const node = makeNode({ id: 'abc' });
      const spy = vi.fn();
      doc.events.on('nodeAdded', spy);
      doc.addNode(node);
      expect(spy).toHaveBeenCalledWith(node);
    });

    it('getNode returns null for unknown UUID', () => {
      const doc = new SceneDocument();
      expect(doc.getNode('unknown')).toBeNull();
    });
  });

  describe('removeNode', () => {
    it('removes node — getNode returns null', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'abc' }));
      doc.removeNode('abc');
      expect(doc.getNode('abc')).toBeNull();
    });

    it('emits nodeRemoved with the original node', () => {
      const doc = new SceneDocument();
      const node = makeNode({ id: 'abc' });
      doc.addNode(node);
      const spy = vi.fn();
      doc.events.on('nodeRemoved', spy);
      doc.removeNode('abc');
      expect(spy).toHaveBeenCalledWith(node);
    });

    it('does nothing for unknown UUID', () => {
      const doc = new SceneDocument();
      const spy = vi.fn();
      doc.events.on('nodeRemoved', spy);
      doc.removeNode('nonexistent');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('updateNode', () => {
    it('applies patch to node', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'abc', name: 'original' }));
      doc.updateNode('abc', { name: 'updated' });
      expect(doc.getNode('abc')?.name).toBe('updated');
    });

    it('emits nodeChanged with uuid and patch', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'abc' }));
      const spy = vi.fn();
      doc.events.on('nodeChanged', spy);
      doc.updateNode('abc', { name: 'new-name' });
      expect(spy).toHaveBeenCalledWith('abc', { name: 'new-name' });
    });

    it('does nothing for unknown UUID', () => {
      const doc = new SceneDocument();
      const spy = vi.fn();
      doc.events.on('nodeChanged', spy);
      doc.updateNode('nonexistent', { name: 'x' });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('getChildren', () => {
    it('returns children sorted by order', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'p' }));
      doc.addNode(makeNode({ id: 'c1', parent: 'p', order: 2 }));
      doc.addNode(makeNode({ id: 'c2', parent: 'p', order: 0 }));
      doc.addNode(makeNode({ id: 'c3', parent: 'p', order: 1 }));
      expect(doc.getChildren('p').map(n => n.id)).toEqual(['c2', 'c3', 'c1']);
    });

    it('returns empty array when no children', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'lonely' }));
      expect(doc.getChildren('lonely')).toHaveLength(0);
    });
  });

  describe('getRoots', () => {
    it('returns only nodes with parent === null', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'r1', parent: null }));
      doc.addNode(makeNode({ id: 'r2', parent: null }));
      doc.addNode(makeNode({ id: 'c',  parent: 'r1' }));
      expect(doc.getRoots().map(n => n.id).sort()).toEqual(['r1', 'r2']);
    });
  });

  describe('getPath', () => {
    it('returns single name for root node', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'r', name: 'Scene' }));
      expect(doc.getPath('r')).toBe('Scene');
    });

    it('returns slash-separated ancestor path', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'r', name: 'Scene', parent: null }));
      doc.addNode(makeNode({ id: 'p', name: 'props', parent: 'r' }));
      doc.addNode(makeNode({ id: 'c', name: 'chair', parent: 'p' }));
      expect(doc.getPath('c')).toBe('Scene/props/chair');
    });

    it('returns empty string for unknown UUID', () => {
      const doc = new SceneDocument();
      expect(doc.getPath('unknown')).toBe('');
    });
  });

  describe('findByPath', () => {
    it('finds a node by full path', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'r', name: 'Scene', parent: null }));
      doc.addNode(makeNode({ id: 'p', name: 'props', parent: 'r' }));
      doc.addNode(makeNode({ id: 'c', name: 'chair', parent: 'p' }));
      expect(doc.findByPath('Scene/props/chair')?.id).toBe('c');
    });

    it('finds a root node by name', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'r', name: 'Scene' }));
      expect(doc.findByPath('Scene')?.id).toBe('r');
    });

    it('returns null if path not found', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'r', name: 'Scene' }));
      expect(doc.findByPath('Scene/missing')).toBeNull();
    });
  });

  describe('serialize / deserialize', () => {
    it('round-trips nodes correctly', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'a', name: 'Alpha' }));
      doc.addNode(makeNode({ id: 'b', name: 'Beta', parent: 'a' }));

      const file = doc.serialize();
      expect(file.version).toBe(1);
      expect(file.nodes).toHaveLength(2);

      const doc2 = new SceneDocument();
      doc2.deserialize(file);
      expect(doc2.getNode('a')?.name).toBe('Alpha');
      expect(doc2.getNode('b')?.parent).toBe('a');
    });

    it('emits sceneReplaced on deserialize', () => {
      const doc = new SceneDocument();
      const spy = vi.fn();
      doc.events.on('sceneReplaced', spy);
      doc.deserialize({ version: 1, nodes: [] });
      expect(spy).toHaveBeenCalledOnce();
    });

    it('clears existing nodes on deserialize', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'old' }));
      doc.deserialize({ version: 1, nodes: [] });
      expect(doc.getAllNodes()).toHaveLength(0);
    });
  });

  // ── migrateNodeComponents ───────────────────────────────────────────────────

  describe('mesh migration (legacy source → { path, nodePath? })', () => {
    it('migrates legacy mesh.source (filename only) to { path }', () => {
      const doc = new SceneDocument();
      doc.deserialize({
        version: 1,
        nodes: [makeNode({ id: 'n', components: { mesh: { source: 'model.glb' } } })],
      });
      const node = doc.getNode('n')!;
      const mesh = node.components['mesh'] as Record<string, unknown>;
      expect(mesh['path']).toBe('models/model.glb');
      expect(mesh['source']).toBeUndefined();
      expect(mesh['nodePath']).toBeUndefined();
    });

    it('migrates legacy mesh.source with colon (filename:nodePath)', () => {
      const doc = new SceneDocument();
      doc.deserialize({
        version: 1,
        nodes: [makeNode({ id: 'n', components: { mesh: { source: 'character.glb:Torso' } } })],
      });
      const node = doc.getNode('n')!;
      const mesh = node.components['mesh'] as Record<string, unknown>;
      expect(mesh['path']).toBe('models/character.glb');
      expect(mesh['nodePath']).toBe('Torso');
      expect(mesh['source']).toBeUndefined();
    });

    it('preserves source that already contains "/" as-is (path-like)', () => {
      const doc = new SceneDocument();
      doc.deserialize({
        version: 1,
        nodes: [makeNode({ id: 'n', components: { mesh: { source: 'models/chair.glb' } } })],
      });
      const node = doc.getNode('n')!;
      const mesh = node.components['mesh'] as Record<string, unknown>;
      expect(mesh['path']).toBe('models/chair.glb');
      expect(mesh['source']).toBeUndefined();
    });

    it('does not touch mesh that already has { path } shape (no source)', () => {
      const doc = new SceneDocument();
      doc.deserialize({
        version: 1,
        nodes: [makeNode({ id: 'n', components: { mesh: { path: 'models/desk.glb', nodePath: 'Legs' } } })],
      });
      const node = doc.getNode('n')!;
      const mesh = node.components['mesh'] as Record<string, unknown>;
      expect(mesh['path']).toBe('models/desk.glb');
      expect(mesh['nodePath']).toBe('Legs');
    });

    it('still migrates leaf → prefab alongside mesh migration', () => {
      const doc = new SceneDocument();
      doc.deserialize({
        version: 1,
        nodes: [makeNode({ id: 'n', components: { leaf: { id: 'pf-1' }, mesh: { source: 'a.glb' } } })],
      });
      const node = doc.getNode('n')!;
      const comp = node.components as Record<string, unknown>;
      expect('prefab' in comp).toBe(true);
      expect('leaf' in comp).toBe(false);
      const mesh = comp['mesh'] as Record<string, unknown>;
      expect(mesh['path']).toBe('models/a.glb');
    });
  });

  describe('createNode', () => {
    it('generates a node with correct defaults', () => {
      const doc = new SceneDocument();
      const node = doc.createNode('TestNode');
      expect(node.name).toBe('TestNode');
      expect(node.parent).toBeNull();
      expect(node.order).toBe(0);
      expect(node.position).toEqual([0, 0, 0]);
      expect(node.rotation).toEqual([0, 0, 0]);
      expect(node.scale).toEqual([1, 1, 1]);
      expect(node.components).toEqual({});
      expect(node.userData).toEqual({});
      expect(typeof node.id).toBe('string');
      expect(node.id.length).toBeGreaterThan(0);
    });

    it('sets parent when provided', () => {
      const doc = new SceneDocument();
      const node = doc.createNode('Child', 'parent-uuid');
      expect(node.parent).toBe('parent-uuid');
    });
  });

  describe('hasNode', () => {
    it('returns true for existing node', () => {
      const doc = new SceneDocument();
      doc.addNode(makeNode({ id: 'abc' }));
      expect(doc.hasNode('abc')).toBe(true);
    });

    it('returns false for missing node', () => {
      const doc = new SceneDocument();
      expect(doc.hasNode('abc')).toBe(false);
    });
  });
});
