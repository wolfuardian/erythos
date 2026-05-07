import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SceneDocument } from '../SceneDocument';
import { PrefabInstanceWatcher, SELF_WRITE_WINDOW_MS } from '../PrefabInstanceWatcher';

// NOTE: In v1, prefab nodes use nodeType: 'prefab' + asset: 'prefabs://name'.
// Children of prefab nodes are NOT in SceneDocument at runtime; watcher is
// effectively dormant during normal usage. Tests verify internal logic by
// manually adding child nodes.

function makeProjectManagerMock() {
  const pm = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    onFileChanged: vi.fn(() => () => {}),
  };
  return { pm };
}

async function addInstanceWithChildFlushed(doc: SceneDocument, prefabName: string) {
  const instanceRoot = doc.createNode('Instance');
  instanceRoot.nodeType = 'prefab';
  instanceRoot.asset = 'prefabs://' + prefabName;
  doc.addNode(instanceRoot);
  const child = doc.createNode('Child');
  child.parent = instanceRoot.id;
  doc.addNode(child);
  await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(100);
  return { instanceRootId: instanceRoot.id, childId: child.id };
}

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
    const { instanceRootId } = await addInstanceWithChildFlushed(doc, 'chair');
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
    const { childId } = await addInstanceWithChildFlushed(doc, 'chair');
    pm.writeFile.mockClear();

    doc.updateNode(childId, { name: 'RenamedChild' });

    await vi.advanceTimersByTimeAsync(250);

    expect(pm.writeFile).toHaveBeenCalledOnce();
  });

  it('fires writeFile after 250ms when a child node is removed', async () => {
    const { childId } = await addInstanceWithChildFlushed(doc, 'chair');
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
    await addInstanceWithChildFlushed(doc, 'chair');
    pm.writeFile.mockClear();

    // Find the instance root and mutate it directly
    const instanceRoot = doc.getAllNodes().find(n => n.nodeType === 'prefab')!;
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
    const { childId } = await addInstanceWithChildFlushed(doc, 'chair');
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
    chairInst.nodeType = 'prefab';
    chairInst.asset = 'prefabs://chair';
    doc.addNode(chairInst);
    const chairChild = doc.createNode('ChairChild');
    chairChild.parent = chairInst.id;
    doc.addNode(chairChild);
    await vi.advanceTimersByTimeAsync(250);

    const tableInst = doc.createNode('TableInstance');
    tableInst.nodeType = 'prefab';
    tableInst.asset = 'prefabs://table';
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
    instanceRoot.nodeType = 'prefab';
    instanceRoot.asset = 'prefabs://chair';
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
    instanceRoot.nodeType = 'prefab';
    instanceRoot.asset = 'prefabs://chair';
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
    const { instanceRootId, childId } = await addInstanceWithChildFlushed(doc, 'chair');
    pm.writeFile.mockClear();

    doc.updateNode(childId, { name: 'Renamed' });
    await vi.advanceTimersByTimeAsync(250);

    // Immediately after write, window should be active for originating instance
    expect(watcher.hasRecentSelfWrite('prefabs/chair.prefab', instanceRootId)).toBe(true);
  });

  it('returns false for a different instance root id', async () => {
    const { instanceRootId: instAId, childId } = await addInstanceWithChildFlushed(doc, 'chair');
    pm.writeFile.mockClear();

    // Add a second instance (no children needed for this test)
    const instB = doc.createNode('InstanceB');
    instB.nodeType = 'prefab';
    instB.asset = 'prefabs://chair';
    doc.addNode(instB);

    doc.updateNode(childId, { name: 'Renamed' });
    await vi.advanceTimersByTimeAsync(250);

    // originating instance: true
    expect(watcher.hasRecentSelfWrite('prefabs/chair.prefab', instAId)).toBe(true);
    // other instance: false → SceneSync will rebuild it
    expect(watcher.hasRecentSelfWrite('prefabs/chair.prefab', instB.id)).toBe(false);
  });

  it('returns false after self-write window expires', async () => {
    const { instanceRootId, childId } = await addInstanceWithChildFlushed(doc, 'chair');
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
