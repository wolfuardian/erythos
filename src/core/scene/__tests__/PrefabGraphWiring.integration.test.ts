import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrefabRegistry } from '../PrefabRegistry';
import { PrefabGraph, CircularReferenceError } from '../../io/PrefabGraph';
import type { PrefabAsset } from '../PrefabFormat';
import { serializeToPrefab } from '../PrefabSerializer';
import { Editor } from '../../Editor';
import { ProjectManager } from '../../project/ProjectManager';
import { InstantiatePrefabCommand } from '../../commands/InstantiatePrefabCommand';
import type { AssetPath } from '../../../utils/branded';
import type { SceneNode } from '../SceneFormat';

function makeAssetWithNestedRef(name: string, nestedRefs: string[]): PrefabAsset {
  const nodes: PrefabAsset['nodes'] = [
    { localId: 0, parentLocalId: null, name: 'Root', order: 0,
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], components: {} },
    ...nestedRefs.map((ref, i) => ({
      localId: i + 1, parentLocalId: 0, name: ref, order: i,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      components: { prefab: { asset: ref } } as Record<string, unknown>,
    })),
  ];
  return { version: 1, id: (name + '-id') as any, name, modified: '2024-01-01T00:00:00.000Z', nodes };
}

function asPath(s: string): AssetPath { return s as AssetPath; }

describe('extractPrefabDeps', () => {
  it('returns empty set for asset with no nested prefab refs', async () => {
    const { extractPrefabDeps } = await import('../PrefabFormat');
    const asset = { version: 1 as const, id: 'x' as any, name: 'Plain', modified: '', nodes: [{ localId: 0, parentLocalId: null, name: 'Root', order: 0, position: [0,0,0] as [number,number,number], rotation: [0,0,0] as [number,number,number], scale: [1,1,1] as [number,number,number], components: {} }] };
    expect(extractPrefabDeps(asset).size).toBe(0);
  });

  it('collects nested prefab ref URLs from components.prefab.asset', async () => {
    const { extractPrefabDeps } = await import('../PrefabFormat');
    const asset = makeAssetWithNestedRef('parent', ['prefabs://child-a', 'prefabs://child-b']);
    const deps = extractPrefabDeps(asset);
    expect(deps.size).toBe(2);
    expect(deps.has('prefabs://child-a')).toBe(true);
    expect(deps.has('prefabs://child-b')).toBe(true);
  });
});
describe('serializeToPrefab with nested prefab ref', () => {
  it('encodes non-root prefab node as components.prefab', () => {
    const root: SceneNode = { id: 'r' as any, name: 'Root', parent: null, order: 0, nodeType: 'group', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], userData: {} };
    const child: SceneNode = { id: 'c' as any, name: 'Tree', parent: 'r' as any, order: 0, nodeType: 'prefab', asset: 'prefabs://tree', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], userData: {} };
    const asset = serializeToPrefab('r' as any, [root, child], 'Forest');
    const childNode = asset.nodes.find(n => n.localId === 1)!;
    expect(childNode.components['prefab']).toEqual({ asset: 'prefabs://tree' });
  });

  it('strips self-reference from root node (localId 0)', () => {
    const root: SceneNode = { id: 'r' as any, name: 'Root', parent: null, order: 0, nodeType: 'prefab', asset: 'prefabs://root-self', position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], userData: {} };
    const asset = serializeToPrefab('r' as any, [root], 'Self');
    expect(asset.nodes[0].components['prefab']).toBeUndefined();
  });
});
describe('PrefabRegistry PrefabGraph wiring', () => {
  let graph: PrefabGraph;
  let registry: PrefabRegistry;

  beforeEach(() => {
    graph = new PrefabGraph();
    registry = new PrefabRegistry(graph);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('set() with path populates graph edges', () => {
    const asset = makeAssetWithNestedRef('parent', ['prefabs://child']);
    registry.set('blob:1', asset, asPath('prefabs/parent.prefab'));
    expect(graph.getDeps('prefabs://parent').has('prefabs://child')).toBe(true);
  });

  it('set() without path does not populate graph', () => {
    const asset = makeAssetWithNestedRef('parent', ['prefabs://child']);
    registry.set('blob:1', asset);
    expect(graph.getDeps('prefabs://parent').size).toBe(0);
  });

  it('loadFromURL() with path populates graph edges', async () => {
    const asset = makeAssetWithNestedRef('parent', ['prefabs://child']);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => asset }));
    await registry.loadFromURL('blob:1', asPath('prefabs/parent.prefab'));
    expect(graph.getDeps('prefabs://parent').has('prefabs://child')).toBe(true);
  });

  it('evict() clears graph edges for the evicted URL', () => {
    const asset = makeAssetWithNestedRef('parent', ['prefabs://child']);
    registry.set('blob:1', asset, asPath('prefabs/parent.prefab'));
    registry.evict('blob:1');
    expect(graph.getDeps('prefabs://parent').size).toBe(0);
  });

  it('evictByPath() clears graph edges', () => {
    const asset = makeAssetWithNestedRef('parent', ['prefabs://child']);
    registry.set('blob:1', asset, asPath('prefabs/parent.prefab'));
    registry.evictByPath(asPath('prefabs/parent.prefab'));
    expect(graph.getDeps('prefabs://parent').size).toBe(0);
  });

  it('clear() resets entire graph', () => {
    const a = makeAssetWithNestedRef('a', ['prefabs://b']);
    const b = makeAssetWithNestedRef('b', ['prefabs://c']);
    registry.set('blob:1', a, asPath('prefabs/a.prefab'));
    registry.set('blob:2', b, asPath('prefabs/b.prefab'));
    registry.clear();
    expect(graph.getDeps('prefabs://a').size).toBe(0);
    expect(graph.getDeps('prefabs://b').size).toBe(0);
  });
});
describe('N-hop cycle detection integration', () => {
  it('2-hop chain: wouldCreateCycle detects cycle after registry populates edges', () => {
    const graph = new PrefabGraph();
    const registry = new PrefabRegistry(graph);
    registry.set('blob:a', makeAssetWithNestedRef('a', ['prefabs://b']), asPath('prefabs/a.prefab'));
    registry.set('blob:b', makeAssetWithNestedRef('b', ['prefabs://a']), asPath('prefabs/b.prefab'));
    expect(graph.wouldCreateCycle('prefabs://a', 'prefabs://b')).toBe(true);
    expect(graph.wouldCreateCycle('prefabs://b', 'prefabs://a')).toBe(true);
  });

  it('3-hop chain: wouldCreateCycle detects cycle after registry populates edges', () => {
    const graph = new PrefabGraph();
    const registry = new PrefabRegistry(graph);
    registry.set('blob:a', makeAssetWithNestedRef('a', ['prefabs://b']), asPath('prefabs/a.prefab'));
    registry.set('blob:b', makeAssetWithNestedRef('b', ['prefabs://c']), asPath('prefabs/b.prefab'));
    registry.set('blob:c', makeAssetWithNestedRef('c', ['prefabs://a']), asPath('prefabs/c.prefab'));
    expect(graph.wouldCreateCycle('prefabs://c', 'prefabs://a')).toBe(true);
  });

  it('non-cycle chain does NOT trigger cycle detection', () => {
    const graph = new PrefabGraph();
    const registry = new PrefabRegistry(graph);
    registry.set('blob:a', makeAssetWithNestedRef('a', ['prefabs://b']), asPath('prefabs/a.prefab'));
    registry.set('blob:b', makeAssetWithNestedRef('b', ['prefabs://c']), asPath('prefabs/b.prefab'));
    registry.set('blob:c', makeAssetWithNestedRef('c', []), asPath('prefabs/c.prefab'));
    expect(graph.wouldCreateCycle('prefabs://a', 'prefabs://b')).toBe(false);
    expect(graph.wouldCreateCycle('prefabs://b', 'prefabs://c')).toBe(false);
  });

  it('InstantiatePrefabCommand throws CircularReferenceError for 2-hop cycle via registry wiring', () => {
    vi.useFakeTimers();
    localStorage.clear();
    const editor = new Editor(new ProjectManager());
    const currentPath = editor.projectManager.currentScenePath();
    // Registry wires prefabs://a -> prefabs://b into the graph
    editor.prefabRegistry.set('blob:a', makeAssetWithNestedRef('a', ['prefabs://b']), asPath('prefabs/a.prefab'));
    // Add B -> scene back-edge so chain: prefabs://a -> prefabs://b -> scene
    editor.prefabGraph.addEdge('prefabs://b', currentPath);
    // assertNoCycle(scene, prefabs://a): a transitively reaches scene => cycle detected
    const cmd = new InstantiatePrefabCommand(editor, asPath('prefabs/a.prefab'));
    expect(() => editor.execute(cmd)).toThrow(CircularReferenceError);
    editor.dispose();
    vi.useRealTimers();
  });
});