/**
 * SceneDocument.deserialize — invariant integration tests.
 *
 * Verifies that deserialize() correctly:
 *   1. Passes valid v1 and v0 fixtures (regression)
 *   2. Throws UnsupportedVersionError on version > CURRENT_VERSION
 *   3. Throws SceneInvariantError with specific path+reason for each bad-fixture
 *
 * Tests are separate from SceneDocument.test.ts to avoid modifying
 * the existing test file (which exercises non-invariant behavior).
 */

import { describe, it, expect } from 'vitest';
import { SceneDocument } from '../SceneDocument';
import { SceneInvariantError, UnsupportedVersionError } from '../SceneDocument';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeV1Scene(nodeOverrides: object[] = []) {
  return {
    version: 1,
    env: { hdri: null, intensity: 1, rotation: 0 },
    nodes: nodeOverrides,
  };
}

function makeGroupNode(id: string, parent: string | null = null) {
  return {
    id,
    name: `Node-${id}`,
    parent,
    order: 0,
    nodeType: 'group',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    userData: {},
  };
}

// ── Valid fixture regression ───────────────────────────────────────────────────

describe('SceneDocument.deserialize — valid fixtures', () => {
  it('empty v1 scene deserializes without error', () => {
    const doc = new SceneDocument();
    expect(() => doc.deserialize(makeV1Scene())).not.toThrow();
    expect(doc.getAllNodes()).toHaveLength(0);
  });

  it('v1 fixture with all node types deserializes correctly', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      makeGroupNode('g1'),
      { ...makeGroupNode('m1'), nodeType: 'mesh', asset: 'assets://box.glb' },
      { ...makeGroupNode('l1'), nodeType: 'light', light: { type: 'directional', color: '#ffffff', intensity: 1 } },
      { ...makeGroupNode('c1'), nodeType: 'camera', camera: { type: 'perspective', fov: 75, near: 0.1, far: 1000 } },
      { ...makeGroupNode('p1'), nodeType: 'prefab', asset: 'prefabs://tree' },
    ]);
    expect(() => doc.deserialize(scene)).not.toThrow();
    expect(doc.getAllNodes()).toHaveLength(5);
  });

  it('v0 fixture (components-bag) is migrated and validated successfully', async () => {
    const v0sample = await import('../io/__tests__/__fixtures__/v0_sample.json');
    const doc = new SceneDocument();
    expect(() => doc.deserialize(v0sample.default)).not.toThrow();
  });

  it('v1 fixture (full fixture file) deserializes correctly', async () => {
    const v1sample = await import('../io/__tests__/__fixtures__/v1_sample.json');
    const doc = new SceneDocument();
    expect(() => doc.deserialize(v1sample.default)).not.toThrow();
    expect(doc.getAllNodes().length).toBeGreaterThan(0);
  });
});

// ── Version gate ──────────────────────────────────────────────────────────────

describe('SceneDocument.deserialize — version gate', () => {
  it('throws UnsupportedVersionError for version > CURRENT_VERSION', () => {
    const doc = new SceneDocument();
    expect(() => doc.deserialize({ version: 999, env: {}, nodes: [] }))
      .toThrow(UnsupportedVersionError);
  });

  it('UnsupportedVersionError message is user-readable and contains version', () => {
    const doc = new SceneDocument();
    try {
      doc.deserialize({ version: 99, env: {}, nodes: [] });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedVersionError);
      const err = e as UnsupportedVersionError;
      expect(err.message).toContain('99');
      expect(err.fileVersion).toBe(99);
    }
  });

  it('throws SceneInvariantError for non-integer version', () => {
    const doc = new SceneDocument();
    expect(() => doc.deserialize({ version: 'foo', nodes: [] }))
      .toThrow(SceneInvariantError);
  });

  it('throws SceneInvariantError for version 0', () => {
    const doc = new SceneDocument();
    expect(() => doc.deserialize({ version: 0, nodes: [] }))
      .toThrow(SceneInvariantError);
  });
});

// ── Invariant rejection — each bad-fixture ────────────────────────────────────

describe('SceneDocument.deserialize — invariant rejections', () => {
  it('rejects: missing asset on mesh node', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      { ...makeGroupNode('m1'), nodeType: 'mesh' }, // no asset
    ]);
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
    try {
      doc.deserialize(scene);
    } catch (e) {
      const err = e as SceneInvariantError;
      expect(err.violations.some(v => v.path.includes('asset'))).toBe(true);
    }
  });

  it('rejects: node.parent pointing to non-existent id', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      makeGroupNode('orphan', 'ghost-parent-id'),
    ]);
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
    try {
      doc.deserialize(scene);
    } catch (e) {
      const err = e as SceneInvariantError;
      expect(err.violations.some(v => v.path.includes('parent'))).toBe(true);
      expect(err.violations.some(v => v.reason.includes('ghost-parent-id'))).toBe(true);
    }
  });

  it('rejects: duplicate node ids', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      makeGroupNode('dup-id'),
      makeGroupNode('dup-id'),
    ]);
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
    try {
      doc.deserialize(scene);
    } catch (e) {
      const err = e as SceneInvariantError;
      expect(err.violations.some(v => v.path.includes('.id'))).toBe(true);
    }
  });

  it('rejects: prefab node with expanded children', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      { ...makeGroupNode('pref1'), nodeType: 'prefab', asset: 'prefabs://tree' },
      makeGroupNode('child1', 'pref1'), // expanded subtree
    ]);
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
    try {
      doc.deserialize(scene);
    } catch (e) {
      const err = e as SceneInvariantError;
      expect(err.violations.some(v => v.reason.includes('pref1'))).toBe(true);
    }
  });

  it('rejects: userData with non-empty content', () => {
    const doc = new SceneDocument();
    const scene = {
      version: 1,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [{
        id: 'a1',
        name: 'Node',
        parent: null,
        order: 0,
        nodeType: 'group',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        userData: { forbidden: true },
      }],
    };
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
  });

  it('rejects: light nodeType missing light field', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      { ...makeGroupNode('l1'), nodeType: 'light' }, // no light field
    ]);
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
    try {
      doc.deserialize(scene);
    } catch (e) {
      const err = e as SceneInvariantError;
      expect(err.violations.some(v => v.reason.includes('"light"'))).toBe(true);
    }
  });

  it('rejects: camera nodeType missing camera field', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      { ...makeGroupNode('c1'), nodeType: 'camera' }, // no camera field
    ]);
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
  });

  it('rejects: node with inline geometry field', () => {
    const doc = new SceneDocument();
    const scene = {
      version: 1,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [{ ...makeGroupNode('x'), geometry: { type: 'BoxGeometry' } }],
    };
    expect(() => doc.deserialize(scene)).toThrow(SceneInvariantError);
  });

  it('error message contains specific path and reason (not just a stack trace)', () => {
    const doc = new SceneDocument();
    const scene = makeV1Scene([
      { ...makeGroupNode('m1'), nodeType: 'mesh' }, // missing asset
    ]);
    try {
      doc.deserialize(scene);
      expect.fail('should throw');
    } catch (e) {
      const err = e as SceneInvariantError;
      expect(err.name).toBe('SceneInvariantError');
      // Message should contain a human-readable path like "nodes[0]"
      expect(err.message).toMatch(/nodes\[0\]/);
      // Not a raw stack trace
      expect(err.message).not.toContain('at Object.');
    }
  });
});
