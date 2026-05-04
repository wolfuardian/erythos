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
    components: {},
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

  it('strips components.prefab from root node (no self-reference)', () => {
    const node = makeNode({
      components: { prefab: { path: 'prefabs/chair.prefab' } },
    });
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    expect(asset.nodes[0].components).not.toHaveProperty('prefab');
  });

  it('strips mesh.url (blob URL) so it is not persisted to disk', () => {
    const node = makeNode({
      components: {
        mesh: { path: 'models/chair.glb', url: 'blob:http://localhost/abc-123' },
      },
    });
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    const mesh = asset.nodes[0].components['mesh'] as Record<string, unknown>;
    expect(mesh).not.toHaveProperty('url');
    expect(mesh['path']).toBe('models/chair.glb');
  });

  it('does not mutate the original node components', () => {
    const components = {
      mesh: { path: 'models/chair.glb', url: 'blob:http://localhost/abc-123' },
    };
    const node = makeNode({ components });
    serializeToPrefab('uuid-root', [node], 'Chair');
    // Original must be unchanged
    expect((components.mesh as Record<string, unknown>)['url']).toBe('blob:http://localhost/abc-123');
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

  it('does not include components.prefab on instantiated nodes', () => {
    const node = makeNode({ components: { prefab: { path: 'prefabs/chair.prefab' } } });
    const asset = serializeToPrefab('uuid-root', [node], 'Chair');
    const nodes = deserializeFromPrefab(asset, null);
    // prefab component is stripped by serializeToPrefab; deserializeFromPrefab
    // does not add it back (InstantiatePrefabCommand handles that)
    expect(nodes[0].components).not.toHaveProperty('prefab');
  });
});
