import { describe, it, expect } from 'vitest';
import { serializeToPrefab, deserializeFromPrefab } from '../PrefabSerializer';
import type { SceneNode } from '../SceneFormat';

function makeNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'uuid-root',
    name: 'Root',
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

describe('serializeToPrefab', () => {
  it('produces a PrefabAsset with version 1 and matching name', () => {
    const node = makeNode();
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    expect(asset.version).toBe(1);
    expect(asset.name).toBe('Chair');
    expect(asset.nodes).toHaveLength(1);
  });

  it('does not include prefab self-reference in serialized PrefabNode', () => {
    const node = makeNode({ nodeType: 'prefab', asset: 'prefabs://chair' });
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    expect(asset.nodes[0].components).not.toHaveProperty('prefab');
  });

  it('converts v1 mesh asset to components.mesh in prefab format', () => {
    const node = makeNode({ nodeType: 'mesh', asset: 'project://models/chair.glb' });
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    const mesh = asset.nodes[0].components['mesh'] as Record<string, unknown>;
    expect(mesh['path']).toBe('models/chair.glb');
  });

  it('does not mutate the original node', () => {
    const node = makeNode({ nodeType: 'mesh', asset: 'project://models/chair.glb', mat: { color: 0xff0000 } });
    const originalAsset = node.asset;
    serializeToPrefab('uuid-root', [node], 'Chair');
    // Original asset field must be unchanged
    expect(node.asset).toBe(originalAsset);
    expect(node.mat?.color).toBe(0xff0000);
  });

  it('assigns localId 0 to root, sequential ids to children', () => {
    const root = makeNode({ id: 'r', name: 'Root' });
    const child = makeNode({ id: 'c', name: 'Child', parent: 'r' });
    const asset = serializeToPrefab('r', [root, child], 'Group');
    expect(asset.nodes[0].localId).toBe(0);
    expect(asset.nodes[1].localId).toBe(1);
    expect(asset.nodes[1].parentLocalId).toBe(0);
  });
});

describe('deserializeFromPrefab', () => {
  it('generates fresh UUIDs for each node', () => {
    const node = makeNode();
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    const nodes = deserializeFromPrefab(asset, null);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).not.toBe('uuid-root');
  });

  it('sets root parentUUID from argument', () => {
    const node = makeNode();
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    const nodes = deserializeFromPrefab(asset, 'parent-scene-uuid');
    expect(nodes[0].parent).toBe('parent-scene-uuid');
  });

  it('instantiated nodes do not have prefab nodeType (InstantiatePrefabCommand sets that)', () => {
    const node = makeNode({ nodeType: 'prefab', asset: 'prefabs://chair' });
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    const nodes = deserializeFromPrefab(asset, null);
    // deserializeFromPrefab does not set nodeType: 'prefab' - InstantiatePrefabCommand handles that
    expect(nodes[0].nodeType).not.toBe('prefab');
  });
});
