/**
 * PrefabLiveSync integration test — round-trip: edit in Workshop → save → scene instance updates.
 *
 * Scope: PrefabRegistry.attach() + SceneSync.attachPrefabRegistry() + rebuild path.
 *
 * We do NOT spin up a full Editor — instead we wire the three units directly:
 *   1. A mock ProjectManager that emits fileChanged with a new URL
 *   2. PrefabRegistry.attach() picks up fileChanged, refetches, emits prefabChanged
 *   3. SceneSync.attachPrefabRegistry() receives prefabChanged, rebuilds instance subtrees
 *
 * This is the minimal wire needed to verify the live-sync chain without requiring
 * a real FileSystem handle or a running browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene } from 'three';
import { PrefabRegistry } from '../PrefabRegistry';
import { SceneSync } from '../SceneSync';
import { SceneDocument } from '../SceneDocument';
import type { PrefabAsset } from '../PrefabFormat';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAsset(name: string, nodeNames: string[] = []): PrefabAsset {
  return {
    version: 1,
    id: `asset-${name}`,
    name,
    modified: new Date().toISOString(),
    nodes: nodeNames.map((n, i) => ({
      localId: i,
      parentLocalId: null,
      name: n,
      order: i,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      components: {},
    })),
  };
}

/**
 * Minimal mock for ProjectManager.onFileChanged subscriber pattern.
 * Returns a trigger function to simulate a file-write event.
 */
function makeProjectManagerMock() {
  let _listener: ((path: string, newURL: string) => void) | null = null;

  const pm = {
    onFileChanged: vi.fn((fn: (path: string, newURL: string) => void) => {
      _listener = fn;
      return () => { _listener = null; };
    }),
  };

  const triggerFileChanged = (path: string, newURL: string) => {
    _listener?.(path, newURL);
  };

  return { pm, triggerFileChanged };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PrefabRegistry.attach — fileChanged → prefabChanged chain', () => {
  let registry: PrefabRegistry;

  beforeEach(() => {
    registry = new PrefabRegistry();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    registry.detach();
  });

  it('emits prefabChanged after fileChanged triggers a successful refetch', async () => {
    const { pm, triggerFileChanged } = makeProjectManagerMock();

    // Pre-populate registry so it knows about the path
    const originalAsset = makeAsset('Chair', ['Seat', 'Legs']);
    registry.set('blob:original', originalAsset, 'prefabs/chair.prefab');

    // Attach to mock ProjectManager
    registry.attach(pm as any);

    // Set up prefabChanged listener
    const prefabChangedSpy = vi.fn();
    registry.on('prefabChanged', prefabChangedSpy);

    // Prepare the new asset (simulates what's on disk after file write)
    const updatedAsset = makeAsset('Chair', ['Seat', 'Legs', 'Backrest']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => updatedAsset,
    }));

    // Trigger fileChanged (simulates ProjectManager.writeFile + URL rotation)
    const newURL = 'blob:updated';
    triggerFileChanged('prefabs/chair.prefab', newURL);

    // Wait for the async refetch to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(prefabChangedSpy).toHaveBeenCalledOnce();
    expect(prefabChangedSpy).toHaveBeenCalledWith(newURL, updatedAsset, 'prefabs/chair.prefab');
  });

  it('does not emit prefabChanged for unknown paths', async () => {
    const { pm, triggerFileChanged } = makeProjectManagerMock();
    registry.attach(pm as any);

    const prefabChangedSpy = vi.fn();
    registry.on('prefabChanged', prefabChangedSpy);

    // Trigger for a path not in registry
    triggerFileChanged('prefabs/unknown.prefab', 'blob:new');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(prefabChangedSpy).not.toHaveBeenCalled();
  });

  it('evicts old URL and caches new URL after refetch', async () => {
    const { pm, triggerFileChanged } = makeProjectManagerMock();
    const originalAsset = makeAsset('Table', ['Top']);
    registry.set('blob:original', originalAsset, 'prefabs/table.prefab');

    registry.attach(pm as any);

    const updatedAsset = makeAsset('Table', ['Top', 'Legs']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => updatedAsset,
    }));

    triggerFileChanged('prefabs/table.prefab', 'blob:updated');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(registry.has('blob:original')).toBe(false);
    expect(registry.has('blob:updated')).toBe(true);
    expect(registry.get('blob:updated')).toEqual(updatedAsset);
    expect(registry.getURLForPath('prefabs/table.prefab')).toBe('blob:updated');
  });

  it('soft-fails and does not emit prefabChanged when fetch errors', async () => {
    const { pm, triggerFileChanged } = makeProjectManagerMock();
    registry.set('blob:original', makeAsset('Bad'), 'prefabs/bad.prefab');
    registry.attach(pm as any);

    const prefabChangedSpy = vi.fn();
    registry.on('prefabChanged', prefabChangedSpy);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));

    triggerFileChanged('prefabs/bad.prefab', 'blob:bad-new');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(prefabChangedSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('detach() stops receiving fileChanged events', async () => {
    const { pm, triggerFileChanged } = makeProjectManagerMock();
    registry.set('blob:original', makeAsset('Test'), 'prefabs/test.prefab');
    registry.attach(pm as any);

    const prefabChangedSpy = vi.fn();
    registry.on('prefabChanged', prefabChangedSpy);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeAsset('Test-updated'),
    }));

    registry.detach();
    triggerFileChanged('prefabs/test.prefab', 'blob:updated');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(prefabChangedSpy).not.toHaveBeenCalled();
  });
});

describe('SceneSync.attachPrefabRegistry — rebuild instance subtrees on prefabChanged', () => {
  let doc: SceneDocument;
  let scene: Scene;
  let sync: SceneSync;
  let registry: PrefabRegistry;

  beforeEach(() => {
    doc = new SceneDocument();
    scene = new Scene();
    sync = new SceneSync(doc, scene);
    registry = new PrefabRegistry();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    sync.dispose();
    registry.detach();
    vi.unstubAllGlobals();
  });

  it('rebuilds instance subtree when prefabChanged fires', async () => {
    // Arrange: instance root in scene document with prefab component
    const instanceRoot = doc.createNode('Chair-Instance');
    instanceRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(instanceRoot);

    // Add an existing child (simulating previously instantiated subtree)
    const oldChild = doc.createNode('OldChild');
    oldChild.parent = instanceRoot.id;
    doc.addNode(oldChild);

    sync.attachPrefabRegistry(registry);

    // New asset with different child structure
    const updatedAsset = makeAsset('Chair', ['Seat', 'Back']);

    // Simulate prefabChanged event directly on registry
    (registry as any)._emitPrefabChanged('blob:updated', updatedAsset, 'prefabs/chair.prefab');

    // Wait for sync processing (microtask / synchronous in this test)
    await Promise.resolve();

    // Old child should be gone
    expect(doc.getNode(oldChild.id)).toBeNull();

    // Two new children (Seat, Back) should be parented under instanceRoot
    const children = doc.getChildren(instanceRoot.id);
    expect(children).toHaveLength(2);
    expect(children.map(c => c.name).sort()).toEqual(['Back', 'Seat']);
  });

  it('updates the instance root prefab.url to the new URL after rebuild', async () => {
    const instanceRoot = doc.createNode('Chair-Instance');
    instanceRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(instanceRoot);

    sync.attachPrefabRegistry(registry);

    const updatedAsset = makeAsset('Chair', ['Seat']);
    (registry as any)._emitPrefabChanged('blob:v2', updatedAsset, 'prefabs/chair.prefab');

    await Promise.resolve();

    const updated = doc.getNode(instanceRoot.id);
    const prefabComp = updated?.components['prefab'] as { url?: string; path?: string } | undefined;
    expect(prefabComp?.url).toBe('blob:v2');
    expect(prefabComp?.path).toBe('prefabs/chair.prefab');
  });

  it('does not affect instances referencing a different prefab path', async () => {
    const chairInstance = doc.createNode('Chair-Instance');
    chairInstance.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:chair' } };
    doc.addNode(chairInstance);

    const tableInstance = doc.createNode('Table-Instance');
    tableInstance.components = { prefab: { path: 'prefabs/table.prefab', url: 'blob:table' } };
    doc.addNode(tableInstance);

    sync.attachPrefabRegistry(registry);

    // Fire change only for chair
    const updatedAsset = makeAsset('Chair', ['NewSeat']);
    (registry as any)._emitPrefabChanged('blob:chair-v2', updatedAsset, 'prefabs/chair.prefab');

    await Promise.resolve();

    // Table instance should be unchanged
    const tableNode = doc.getNode(tableInstance.id);
    const tablePrefab = tableNode?.components['prefab'] as { url?: string } | undefined;
    expect(tablePrefab?.url).toBe('blob:table');
  });

  it('handles multiple instances of the same prefab', async () => {
    const inst1 = doc.createNode('Chair-A');
    inst1.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(inst1);

    const inst2 = doc.createNode('Chair-B');
    inst2.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(inst2);

    sync.attachPrefabRegistry(registry);

    const updatedAsset = makeAsset('Chair', ['Seat']);
    (registry as any)._emitPrefabChanged('blob:v2', updatedAsset, 'prefabs/chair.prefab');

    await Promise.resolve();

    // Both instances should have new child
    const children1 = doc.getChildren(inst1.id);
    const children2 = doc.getChildren(inst2.id);
    expect(children1).toHaveLength(1);
    expect(children2).toHaveLength(1);
    expect(children1[0].name).toBe('Seat');
    expect(children2[0].name).toBe('Seat');
  });

  it('stops rebuilding after dispose', async () => {
    const instanceRoot = doc.createNode('Chair-Instance');
    instanceRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(instanceRoot);

    sync.attachPrefabRegistry(registry);
    sync.dispose();

    // Fire event AFTER dispose
    const updatedAsset = makeAsset('Chair', ['Seat']);
    (registry as any)._emitPrefabChanged('blob:v2', updatedAsset, 'prefabs/chair.prefab');

    await Promise.resolve();

    // Instance root's url should NOT have changed (listener removed)
    const node = doc.getNode(instanceRoot.id);
    const prefabComp = node?.components['prefab'] as { url?: string } | undefined;
    expect(prefabComp?.url).toBe('blob:original');
  });
});

describe('Round-trip integration: Workshop save → SceneSync live rebuild', () => {
  it('complete chain: fileChanged → registry refetch → SceneSync rebuilds', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────────
    const { pm, triggerFileChanged } = makeProjectManagerMock();

    const registry = new PrefabRegistry();
    const doc = new SceneDocument();
    const scene = new Scene();
    const sync = new SceneSync(doc, scene);

    // Register initial prefab
    const v1Asset = makeAsset('Lamp', ['Base', 'Shade']);
    registry.set('blob:lamp-v1', v1Asset, 'prefabs/lamp.prefab');

    // Add an instance node in the scene
    const instanceRoot = doc.createNode('Lamp-Instance');
    instanceRoot.components = { prefab: { path: 'prefabs/lamp.prefab', url: 'blob:lamp-v1' } };
    doc.addNode(instanceRoot);

    // Add old children (the current instantiation)
    const oldBase = { ...doc.createNode('Base'), parent: instanceRoot.id };
    const oldShade = { ...doc.createNode('Shade'), parent: instanceRoot.id };
    doc.addNode(oldBase);
    doc.addNode(oldShade);

    // Wire live-sync chain
    registry.attach(pm as any);
    sync.attachPrefabRegistry(registry);

    // ── Act: simulate "Workshop save" — new prefab with extra Bulb node ──────
    const v2Asset = makeAsset('Lamp', ['Base', 'Shade', 'Bulb']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => v2Asset,
    }));

    // ProjectManager.writeFile internally revokes old URL and fires fileChanged
    triggerFileChanged('prefabs/lamp.prefab', 'blob:lamp-v2');

    // Wait for async refetch + rebuild
    await new Promise(resolve => setTimeout(resolve, 0));

    // ── Assert ────────────────────────────────────────────────────────────────

    // Old children should be gone
    expect(doc.getNode(oldBase.id)).toBeNull();
    expect(doc.getNode(oldShade.id)).toBeNull();

    // New children from v2 should be present
    const children = doc.getChildren(instanceRoot.id);
    expect(children).toHaveLength(3);
    expect(children.map(c => c.name).sort()).toEqual(['Base', 'Bulb', 'Shade']);

    // Instance root's prefab.url should point to new URL
    const updatedRoot = doc.getNode(instanceRoot.id);
    const prefabComp = updatedRoot?.components['prefab'] as { url?: string; path?: string } | undefined;
    expect(prefabComp?.url).toBe('blob:lamp-v2');
    expect(prefabComp?.path).toBe('prefabs/lamp.prefab'); // path remains stable

    // Three.js scene should have the instance root's Object3D
    expect(sync.getObject3D(instanceRoot.id)).not.toBeNull();

    // Clean up
    sync.dispose();
    registry.detach();
    vi.unstubAllGlobals();
  });
});
