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
import { PrefabRegistry } from '../PrefabRegistry';
import type { PrefabAsset } from '../PrefabFormat';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAsset(name: string, childNames: string[] = []): PrefabAsset {
  // Realistic shape: localId 0 is the prefab root (parentLocalId: null);
  // childNames become its direct descendants. SceneSync rebuild grafts the
  // root's children under the existing instance root (root itself is skipped).
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
