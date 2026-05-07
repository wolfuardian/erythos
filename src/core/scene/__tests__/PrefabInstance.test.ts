import { describe, it, expect } from 'vitest';
import type { SceneNode } from '../SceneFormat';
import { isPrefabDescendant, findPrefabInstanceRoot } from '../PrefabInstance';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  parent: string | null,
  nodeType: SceneNode['nodeType'] = 'group',
  asset?: string,
): SceneNode {
  return {
    id,
    name: id,
    parent,
    order: 0,
    nodeType,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...(asset !== undefined ? { asset } : {}),
    userData: {},
  };
}

/**
 * Tree layout:
 *   root (plain group)
 *     instance (nodeType: prefab) ← instance root
 *       child                      ← prefab descendant
 *         grandchild               ← prefab descendant
 *     sibling (plain group)
 */
function makeTree() {
  return [
    makeNode('root', null),
    makeNode('instance', 'root', 'prefab', 'prefabs://foo'),
    makeNode('child', 'instance'),
    makeNode('grandchild', 'child'),
    makeNode('sibling', 'root'),
  ];
}

// ── isPrefabDescendant ────────────────────────────────────────────────────────

describe('isPrefabDescendant', () => {
  it('returns false for a plain root node', () => {
    expect(isPrefabDescendant('root', makeTree())).toBe(false);
  });

  it('returns false for the instance root itself (not a descendant)', () => {
    expect(isPrefabDescendant('instance', makeTree())).toBe(false);
  });

  it('returns true for a direct child of an instance root', () => {
    expect(isPrefabDescendant('child', makeTree())).toBe(true);
  });

  it('returns true for a grandchild of an instance root', () => {
    expect(isPrefabDescendant('grandchild', makeTree())).toBe(true);
  });

  it('returns false for a plain sibling of the instance root', () => {
    expect(isPrefabDescendant('sibling', makeTree())).toBe(false);
  });

  it('returns false for an unknown node id', () => {
    expect(isPrefabDescendant('nonexistent', makeTree())).toBe(false);
  });

  it('returns false for an empty node list', () => {
    expect(isPrefabDescendant('child', [])).toBe(false);
  });

  it('handles nested instances: child of inner instance root is also a descendant', () => {
    // outer-instance → inner-instance (also a prefab) → deep-child
    const nodes = [
      makeNode('outer-instance', null, 'prefab', 'prefabs://outer'),
      makeNode('inner-instance', 'outer-instance', 'prefab', 'prefabs://inner'),
      makeNode('deep-child', 'inner-instance'),
    ];
    // inner-instance is a descendant of outer-instance
    expect(isPrefabDescendant('inner-instance', nodes)).toBe(true);
    // deep-child is a descendant of inner-instance (and transitively of outer-instance)
    expect(isPrefabDescendant('deep-child', nodes)).toBe(true);
  });
});

// ── findPrefabInstanceRoot ────────────────────────────────────────────────────

describe('findPrefabInstanceRoot', () => {
  it('returns null for a plain root node', () => {
    expect(findPrefabInstanceRoot('root', makeTree())).toBeNull();
  });

  it('returns null for the instance root itself', () => {
    expect(findPrefabInstanceRoot('instance', makeTree())).toBeNull();
  });

  it('returns the instance root id for a direct child', () => {
    expect(findPrefabInstanceRoot('child', makeTree())).toBe('instance');
  });

  it('returns the instance root id for a grandchild', () => {
    expect(findPrefabInstanceRoot('grandchild', makeTree())).toBe('instance');
  });

  it('returns null for a plain sibling', () => {
    expect(findPrefabInstanceRoot('sibling', makeTree())).toBeNull();
  });

  it('returns null for an unknown node', () => {
    expect(findPrefabInstanceRoot('unknown', makeTree())).toBeNull();
  });

  it('returns nearest instance root for nested instances', () => {
    // outer-instance → inner-instance (also prefab) → deep-child
    const nodes = [
      makeNode('outer-instance', null, 'prefab', 'prefabs://outer'),
      makeNode('inner-instance', 'outer-instance', 'prefab', 'prefabs://inner'),
      makeNode('deep-child', 'inner-instance'),
    ];
    // The nearest root for deep-child is inner-instance (walk stops at first ancestor with prefab)
    expect(findPrefabInstanceRoot('deep-child', nodes)).toBe('inner-instance');
    // The nearest root for inner-instance (which is itself a descendant) is outer-instance
    expect(findPrefabInstanceRoot('inner-instance', nodes)).toBe('outer-instance');
  });
});
