/**
 * PrefabInstanceWatcher unit tests.
 *
 * Covers:
 *   1. Mutation inside instance subtree → writeFile fires after 250ms debounce
 *   2. Multiple rapid mutations → only one writeFile (debounce collapses)
 *   3. dispose() cancels pending debounce → writeFile never fires
 *   4. hasRecentSelfWrite: originating instance returns true, other instances false
 *   5. Cross-instance: SceneSync skips originating instance, rebuilds others
 *   6. Self-write cascade suppression: events from rebuild don't trigger second write
 *   7. Mutation on instance root itself is ignored (per-instance field)
 *   8. Mutation on non-prefab node is ignored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene } from 'three';
import { SceneDocument } from '../SceneDocument';
import { SceneSync } from '../SceneSync';
import { PrefabRegistry } from '../PrefabRegistry';
import { PrefabInstanceWatcher, SELF_WRITE_WINDOW_MS } from '../PrefabInstanceWatcher';
import type { PrefabAsset } from '../PrefabFormat';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAsset(name: string, childNames: string[] = []): PrefabAsset {
  // Realistic shape: localId 0 is the prefab root; childNames are its direct
  // descendants. Mirrors PrefabLiveSync.test.ts helper.
  return {
    version: 1,
    id: `asset-${name}`,
    name,
    modified: new Date().toISOString(),
    nodes: [
      {
        localId: 0,
        parentLocalId: null,
        name,
        order: 0,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        components: {},
      },
      ...childNames.map((n, i) => ({
        localId: i + 1,
        parentLocalId: 0,
        name: n,
        order: i,
        position: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        components: {},
      })),
    ],
  };
}

/** Minimal mock for ProjectManager. */
function makeProjectManagerMock() {
  let _fileChangedListener: ((path: string, newURL: string) => void) | null = null;

  const pm = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    onFileChanged: vi.fn((fn: (path: string, newURL: string) => void) => {
      _fileChangedListener = fn;
      return () => { _fileChangedListener = null; };
    }),
  };

  const triggerFileChanged = (path: string, newURL: string) => {
    _fileChangedListener?.(path, newURL);
  };

  return { pm, triggerFileChanged };
}

/**
 * Add an instance root + one child node to a doc, THEN flush the debounce that
 * setup triggers (adding the child fires nodeAdded → debounce is armed).
 * After this call, no write is pending.
 */
async function addInstanceWithChildFlushed(doc: SceneDocument, prefabPath: string) {
  const instanceRoot = doc.createNode('Instance');
  instanceRoot.components = { prefab: { path: prefabPath, url: 'blob:original' } };
  doc.addNode(instanceRoot);

  const child = doc.createNode('Child');
  child.parent = instanceRoot.id;
  doc.addNode(child);

  // Flush the debounce so subsequent tests start clean
  await vi.advanceTimersByTimeAsync(250);
  // Advance past the self-write window (50ms) so it doesn't suppress the next test's mutations
  await vi.advanceTimersByTimeAsync(100);

  return { instanceRootId: instanceRoot.id, childId: child.id };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PrefabInstanceWatcher — basic write-on-mutation', () => {
  let doc: SceneDocument;
  let watcher: PrefabInstanceWatcher;
  let pm: ReturnType<typeof makeProjectManagerMock>['pm'];

  beforeEach(() => {
    vi.useFakeTimers();
    doc = new SceneDocument();
    pm = makeProjectManagerMock().pm;
    watcher = new PrefabInstanceWatcher(doc, pm as any);
  });

  afterEach(() => {
    watcher.dispose();
    vi.useRealTimers();
  });

  it('fires writeFile after 250ms when a child node is added inside an instance', async () => {
    const { instanceRootId } = await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    // Add another child — this is the mutation we're testing
    const newChild = doc.createNode('NewChild');
    newChild.parent = instanceRootId;
    doc.addNode(newChild);

    // Before debounce settles: no write
    await vi.advanceTimersByTimeAsync(249);
    expect(pm.writeFile).not.toHaveBeenCalled();

    // After debounce: write fires
    await vi.advanceTimersByTimeAsync(1);
    expect(pm.writeFile).toHaveBeenCalledOnce();
    expect(pm.writeFile).toHaveBeenCalledWith(
      'prefabs/chair.prefab',
      expect.any(String),
    );
  });

  it('fires writeFile after 250ms when a child node property changes', async () => {
    const { childId } = await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    doc.updateNode(childId, { name: 'RenamedChild' });

    await vi.advanceTimersByTimeAsync(250);

    expect(pm.writeFile).toHaveBeenCalledOnce();
  });

  it('fires writeFile after 250ms when a child node is removed', async () => {
    const { childId } = await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    doc.removeNode(childId);

    await vi.advanceTimersByTimeAsync(250);

    expect(pm.writeFile).toHaveBeenCalledOnce();
  });

  it('does NOT fire writeFile when a non-prefab node is mutated', async () => {
    // Plain node, not inside any prefab instance
    const plain = doc.createNode('PlainNode');
    doc.addNode(plain);
    doc.updateNode(plain.id, { name: 'Renamed' });

    await vi.advanceTimersByTimeAsync(500);

    expect(pm.writeFile).not.toHaveBeenCalled();
  });

  it('does NOT fire writeFile when the instance root itself is mutated (per-instance field)', async () => {
    await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    // Find the instance root and mutate it directly
    const instanceRoot = doc.getAllNodes().find(n => n.components['prefab'])!;
    doc.updateNode(instanceRoot.id, { name: 'RenamedInstance' });

    await vi.advanceTimersByTimeAsync(500);

    expect(pm.writeFile).not.toHaveBeenCalled();
  });
});

describe('PrefabInstanceWatcher — debounce collapses multiple mutations', () => {
  let doc: SceneDocument;
  let watcher: PrefabInstanceWatcher;
  let pm: ReturnType<typeof makeProjectManagerMock>['pm'];

  beforeEach(() => {
    vi.useFakeTimers();
    doc = new SceneDocument();
    pm = makeProjectManagerMock().pm;
    watcher = new PrefabInstanceWatcher(doc, pm as any);
  });

  afterEach(() => {
    watcher.dispose();
    vi.useRealTimers();
  });

  it('collapses 5 rapid mutations into a single writeFile', async () => {
    const { childId } = await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    // Fire 5 mutations in rapid succession (each within 50ms of the last)
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(40);
      doc.updateNode(childId, { name: `Step${i}` });
    }

    // Advance past the final debounce window
    await vi.advanceTimersByTimeAsync(250);

    // Only one write should have happened
    expect(pm.writeFile).toHaveBeenCalledOnce();
  });

  it('fires separate writes for mutations to two different prefab paths', async () => {
    // Setup two instances with different paths, flushing each
    const chairInst = doc.createNode('ChairInstance');
    chairInst.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:chair' } };
    doc.addNode(chairInst);
    const chairChild = doc.createNode('ChairChild');
    chairChild.parent = chairInst.id;
    doc.addNode(chairChild);
    await vi.advanceTimersByTimeAsync(250);

    const tableInst = doc.createNode('TableInstance');
    tableInst.components = { prefab: { path: 'prefabs/table.prefab', url: 'blob:table' } };
    doc.addNode(tableInst);
    const tableChild = doc.createNode('TableChild');
    tableChild.parent = tableInst.id;
    doc.addNode(tableChild);
    await vi.advanceTimersByTimeAsync(250);
    // Advance past the self-write window for table
    await vi.advanceTimersByTimeAsync(100);

    pm.writeFile.mockClear();

    // Mutate children of both prefabs
    doc.updateNode(chairChild.id, { name: 'ChairChildRenamed' });
    doc.updateNode(tableChild.id, { name: 'TableChildRenamed' });

    await vi.advanceTimersByTimeAsync(250);

    // Two separate writes, one per path
    expect(pm.writeFile).toHaveBeenCalledTimes(2);
    const paths = pm.writeFile.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(paths).toContain('prefabs/chair.prefab');
    expect(paths).toContain('prefabs/table.prefab');
  });
});

describe('PrefabInstanceWatcher — dispose cancels pending writes', () => {
  it('does not fire writeFile after dispose() cancels the pending debounce', async () => {
    vi.useFakeTimers();
    const doc = new SceneDocument();
    const { pm } = makeProjectManagerMock();
    const watcher = new PrefabInstanceWatcher(doc, pm as any);

    // Setup instance
    const instanceRoot = doc.createNode('Instance');
    instanceRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(instanceRoot);
    const child = doc.createNode('Child');
    child.parent = instanceRoot.id;
    doc.addNode(child);
    // Flush setup debounce
    await vi.advanceTimersByTimeAsync(250);
    pm.writeFile.mockClear();

    // Trigger a mutation — debounce is now pending
    doc.updateNode(child.id, { name: 'Renamed' });

    // Dispose BEFORE the debounce fires
    watcher.dispose();

    await vi.advanceTimersByTimeAsync(500);

    expect(pm.writeFile).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not fire writeFile when a nodeAdded event fires after dispose() (listener removed)', async () => {
    vi.useFakeTimers();
    const doc = new SceneDocument();
    const { pm } = makeProjectManagerMock();
    const watcher = new PrefabInstanceWatcher(doc, pm as any);

    // Setup instance + flush setup debounce
    const instanceRoot = doc.createNode('Instance');
    instanceRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(instanceRoot);
    const child = doc.createNode('Child');
    child.parent = instanceRoot.id;
    doc.addNode(child);
    await vi.advanceTimersByTimeAsync(250);
    pm.writeFile.mockClear();

    // Dispose — listeners should be removed
    watcher.dispose();

    // Fire a mutation event after dispose (simulates SceneSync or other code adding nodes)
    const newChild = doc.createNode('PostDisposeChild');
    newChild.parent = instanceRoot.id;
    doc.addNode(newChild);

    // Advance well past the debounce window — no new debounce should have been armed
    await vi.advanceTimersByTimeAsync(500);

    expect(pm.writeFile).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('PrefabInstanceWatcher — hasRecentSelfWrite', () => {
  let doc: SceneDocument;
  let watcher: PrefabInstanceWatcher;
  let pm: ReturnType<typeof makeProjectManagerMock>['pm'];

  beforeEach(() => {
    vi.useFakeTimers();
    doc = new SceneDocument();
    pm = makeProjectManagerMock().pm;
    watcher = new PrefabInstanceWatcher(doc, pm as any);
  });

  afterEach(() => {
    watcher.dispose();
    vi.useRealTimers();
  });

  it('returns true for originating instance within self-write window', async () => {
    const { instanceRootId, childId } = await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    doc.updateNode(childId, { name: 'Renamed' });
    await vi.advanceTimersByTimeAsync(250);

    // Immediately after write, window should be active for originating instance
    expect(watcher.hasRecentSelfWrite('prefabs/chair.prefab', instanceRootId)).toBe(true);
  });

  it('returns false for a different instance root id', async () => {
    const { instanceRootId: instAId, childId } = await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    // Add a second instance (no children needed for this test)
    const instB = doc.createNode('InstanceB');
    instB.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:original' } };
    doc.addNode(instB);

    doc.updateNode(childId, { name: 'Renamed' });
    await vi.advanceTimersByTimeAsync(250);

    // originating instance: true
    expect(watcher.hasRecentSelfWrite('prefabs/chair.prefab', instAId)).toBe(true);
    // other instance: false → SceneSync will rebuild it
    expect(watcher.hasRecentSelfWrite('prefabs/chair.prefab', instB.id)).toBe(false);
  });

  it('returns false after self-write window expires', async () => {
    const { instanceRootId, childId } = await addInstanceWithChildFlushed(doc, 'prefabs/chair.prefab');
    pm.writeFile.mockClear();

    doc.updateNode(childId, { name: 'Renamed' });
    await vi.advanceTimersByTimeAsync(250);

    // Advance past the self-write window
    await vi.advanceTimersByTimeAsync(SELF_WRITE_WINDOW_MS + 1);

    expect(watcher.hasRecentSelfWrite('prefabs/chair.prefab', instanceRootId)).toBe(false);
  });

  it('returns false for unknown path', () => {
    expect(watcher.hasRecentSelfWrite('prefabs/nonexistent.prefab', 'any-id')).toBe(false);
  });
});

describe('PrefabInstanceWatcher — self-write cascade suppression', () => {
  it('does not schedule a second write when SceneSync rebuild fires mutation events', async () => {
    vi.useFakeTimers();

    const doc = new SceneDocument();
    const { pm, triggerFileChanged } = makeProjectManagerMock();
    const registry = new PrefabRegistry();
    const scene = new Scene();
    const sync = new SceneSync(doc, scene);
    const watcher = new PrefabInstanceWatcher(doc, pm as any);

    // Wire live sync chain
    sync.attachInstanceWatcher(watcher);
    sync.attachPrefabRegistry(registry);
    registry.attach(pm as any);

    // Setup: two instances of the same prefab
    const instA = doc.createNode('InstanceA');
    instA.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:v1' } };
    doc.addNode(instA);
    const childA = doc.createNode('SeatA');
    childA.parent = instA.id;
    doc.addNode(childA);

    const instB = doc.createNode('InstanceB');
    instB.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:v1' } };
    doc.addNode(instB);
    const childB = doc.createNode('SeatB');
    childB.parent = instB.id;
    doc.addNode(childB);

    // Flush setup debounce + advance past self-write window
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(100);
    pm.writeFile.mockClear();

    // Trigger mutation in instance A's subtree
    doc.updateNode(childA.id, { name: 'SeatA-renamed' });

    // Advance debounce → writeFile fires
    await vi.advanceTimersByTimeAsync(250);

    expect(pm.writeFile).toHaveBeenCalledOnce();
    pm.writeFile.mockClear();

    // Simulate the file-changed round-trip: registry refetches and emits prefabChanged.
    // This will cause SceneSync to rebuild instB (firing nodeAdded/nodeRemoved).
    // The cascade suppression must prevent another write from being scheduled.
    const updatedAsset = makeAsset('Chair', ['SeatA-renamed']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => updatedAsset,
    }));

    triggerFileChanged('prefabs/chair.prefab', 'blob:v2');
    // Flush the async fetch chain (fetch → json → prefabChanged → rebuild).
    // We use Promise.resolve flushes rather than runAllTimersAsync to avoid
    // advancing fake time past the self-write window.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Advance past where a cascade-scheduled debounce would fire (T + 250ms)
    // AND past the self-write window expiry (T + 50ms).
    // If cascade suppression broke and a debounce got scheduled during the rebuild,
    // it would fire here and writeFile would be called — making this assertion meaningful.
    await vi.advanceTimersByTimeAsync(300);

    // No second write should have been scheduled
    expect(pm.writeFile).not.toHaveBeenCalled();

    // Cleanup
    watcher.dispose();
    sync.dispose();
    registry.detach();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

describe('PrefabInstanceWatcher — suppress() silences mutations during instantiate', () => {
  it('does not schedule a write when addNode fires during suppress() (InstantiatePrefabCommand pattern)', async () => {
    vi.useFakeTimers();
    const doc = new SceneDocument();
    const { pm } = makeProjectManagerMock();
    const watcher = new PrefabInstanceWatcher(doc, pm as any);

    // Setup an existing instance of the same prefab (the "already in scene" instances)
    const existingRoot = doc.createNode('ExistingInstance');
    existingRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:v1' } };
    doc.addNode(existingRoot);
    const existingChild = doc.createNode('ExistingSeat');
    existingChild.parent = existingRoot.id;
    doc.addNode(existingChild);

    // Flush setup debounce + advance past self-write window
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(100);
    pm.writeFile.mockClear();

    // Simulate InstantiatePrefabCommand.execute(): wrap all addNode calls in suppress()
    watcher.suppress(() => {
      const newRoot = doc.createNode('NewInstance');
      newRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:v1' } };
      doc.addNode(newRoot);
      const newChild = doc.createNode('NewSeat');
      newChild.parent = newRoot.id;
      doc.addNode(newChild);
    });

    // Advance well past debounce — no write should have been scheduled
    await vi.advanceTimersByTimeAsync(250 + 50 + 10);

    expect(pm.writeFile).not.toHaveBeenCalled();

    watcher.dispose();
    vi.useRealTimers();
  });

  it('suppress() is re-entrant: nested calls only resume scheduling after outermost exits', async () => {
    vi.useFakeTimers();
    const doc = new SceneDocument();
    const { pm } = makeProjectManagerMock();
    const watcher = new PrefabInstanceWatcher(doc, pm as any);

    const instanceRoot = doc.createNode('Instance');
    instanceRoot.components = { prefab: { path: 'prefabs/chair.prefab', url: 'blob:v1' } };
    doc.addNode(instanceRoot);
    const child = doc.createNode('Seat');
    child.parent = instanceRoot.id;
    doc.addNode(child);
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(100);
    pm.writeFile.mockClear();

    // Two nested suppress calls — inner exits first, mutations should still be silent
    watcher.suppress(() => {
      watcher.suppress(() => {
        doc.updateNode(child.id, { name: 'InnerChange' });
      });
      // Outer suppress still active — should remain silent
      doc.updateNode(child.id, { name: 'OuterChange' });
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(pm.writeFile).not.toHaveBeenCalled();

    // After suppress fully exits, mutations should be observable again
    doc.updateNode(child.id, { name: 'PostSuppress' });
    await vi.advanceTimersByTimeAsync(300);
    expect(pm.writeFile).toHaveBeenCalledOnce();

    watcher.dispose();
    vi.useRealTimers();
  });
});

describe('PrefabInstanceWatcher — SceneSync cross-instance behavior', () => {
  it('skip originating instance A rebuild, rebuild instances B and C', async () => {
    vi.useFakeTimers();

    const doc = new SceneDocument();
    const { pm, triggerFileChanged } = makeProjectManagerMock();
    const registry = new PrefabRegistry();
    const scene = new Scene();
    const sync = new SceneSync(doc, scene);
    const watcher = new PrefabInstanceWatcher(doc, pm as any);

    sync.attachInstanceWatcher(watcher);
    sync.attachPrefabRegistry(registry);
    registry.attach(pm as any);
    // Pre-populate registry so it knows about the prefab path (required for fileChanged to work)
    const v1Asset = makeAsset('Lamp', ['BulbA', 'BulbB', 'BulbC']);
    registry.set('blob:v1', v1Asset, 'prefabs/lamp.prefab');

    // Three instances
    const instA = doc.createNode('InstA');
    instA.components = { prefab: { path: 'prefabs/lamp.prefab', url: 'blob:v1' } };
    doc.addNode(instA);
    const childA = doc.createNode('BulbA');
    childA.parent = instA.id;
    doc.addNode(childA);

    const instB = doc.createNode('InstB');
    instB.components = { prefab: { path: 'prefabs/lamp.prefab', url: 'blob:v1' } };
    doc.addNode(instB);
    const childB = doc.createNode('BulbB');
    childB.parent = instB.id;
    doc.addNode(childB);

    const instC = doc.createNode('InstC');
    instC.components = { prefab: { path: 'prefabs/lamp.prefab', url: 'blob:v1' } };
    doc.addNode(instC);
    const childC = doc.createNode('BulbC');
    childC.parent = instC.id;
    doc.addNode(childC);

    // Flush setup debounce + advance past self-write window
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(100);
    pm.writeFile.mockClear();

    // Edit inside instance A
    doc.updateNode(childA.id, { name: 'BulbA-New' });

    // Advance debounce → write fires
    await vi.advanceTimersByTimeAsync(250);

    expect(pm.writeFile).toHaveBeenCalledOnce();

    // Simulate the file-changed round-trip
    const updatedAsset = makeAsset('Lamp', ['BulbA-New']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => updatedAsset,
    }));

    triggerFileChanged('prefabs/lamp.prefab', 'blob:v2');
    // Flush the async fetch chain without advancing fake time
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Instance A should still have its child (self-write skip in SceneSync)
    expect(doc.getNode(childA.id)).not.toBeNull();

    // Instance B and C should have been rebuilt with new asset content
    const childrenB = doc.getChildren(instB.id);
    const childrenC = doc.getChildren(instC.id);
    expect(childrenB).toHaveLength(1);
    expect(childrenC).toHaveLength(1);

    // Old childB and childC UUIDs should be gone (they were wiped and replaced)
    expect(doc.getNode(childB.id)).toBeNull();
    expect(doc.getNode(childC.id)).toBeNull();

    // New children should have the new name from the asset
    expect(childrenB[0].name).toBe('BulbA-New');
    expect(childrenC[0].name).toBe('BulbA-New');

    watcher.dispose();
    sync.dispose();
    registry.detach();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
