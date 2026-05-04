import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrefabRegistry } from '../PrefabRegistry';
import type { PrefabAsset } from '../PrefabFormat';

function makeAsset(overrides: Partial<PrefabAsset> = {}): PrefabAsset {
  return {
    version: 1,
    id: 'asset-uuid-1',
    name: 'Chair',
    modified: '2024-01-01T00:00:00.000Z',
    nodes: [],
    ...overrides,
  };
}

describe('PrefabRegistry', () => {
  let registry: PrefabRegistry;

  beforeEach(() => {
    registry = new PrefabRegistry();
    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── set / get ──────────────────────────────────────────────────────────────

  describe('set / get', () => {
    it('stores and retrieves an asset by URL', () => {
      const asset = makeAsset();
      registry.set('blob:test/1', asset);
      expect(registry.get('blob:test/1')).toBe(asset);
    });

    it('returns null for unknown URL', () => {
      expect(registry.get('blob:unknown')).toBeNull();
    });

    it('has() returns true for known URL', () => {
      registry.set('blob:test/1', makeAsset());
      expect(registry.has('blob:test/1')).toBe(true);
    });

    it('has() returns false for unknown URL', () => {
      expect(registry.has('blob:unknown')).toBe(false);
    });

    it('emits changed event on set', () => {
      const listener = vi.fn();
      registry.on('changed', listener);
      registry.set('blob:test/1', makeAsset());
      expect(listener).toHaveBeenCalledOnce();
    });

    it('stores path→url mapping when path provided', () => {
      registry.set('blob:test/1', makeAsset(), 'prefabs/chair.prefab');
      expect(registry.getURLForPath('prefabs/chair.prefab')).toBe('blob:test/1');
    });
  });

  // ── loadFromURL ────────────────────────────────────────────────────────────

  describe('loadFromURL', () => {
    it('fetches, parses and caches the asset', async () => {
      const asset = makeAsset();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => asset,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await registry.loadFromURL('blob:test/1');
      expect(result).toEqual(asset);
      expect(registry.get('blob:test/1')).toEqual(asset);
      expect(mockFetch).toHaveBeenCalledWith('blob:test/1');
    });

    it('returns cached entry without re-fetching on second call', async () => {
      const asset = makeAsset();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => asset,
      });
      vi.stubGlobal('fetch', mockFetch);

      await registry.loadFromURL('blob:test/1');
      await registry.loadFromURL('blob:test/1');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('throws on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
      await expect(registry.loadFromURL('blob:missing')).rejects.toThrow('fetch failed');
    });

    it('throws on invalid prefab format (missing nodes)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: 1 }), // missing nodes
      }));
      await expect(registry.loadFromURL('blob:bad')).rejects.toThrow('invalid prefab format');
    });

    it('stores path→url mapping when path provided', async () => {
      const asset = makeAsset();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => asset }));
      await registry.loadFromURL('blob:test/1', 'prefabs/chair.prefab');
      expect(registry.getURLForPath('prefabs/chair.prefab')).toBe('blob:test/1');
    });

    it('emits changed event after successful load', async () => {
      const asset = makeAsset();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => asset }));
      const listener = vi.fn();
      registry.on('changed', listener);
      await registry.loadFromURL('blob:test/1');
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── evict ──────────────────────────────────────────────────────────────────

  describe('evict', () => {
    it('removes entry by URL', () => {
      registry.set('blob:test/1', makeAsset());
      registry.evict('blob:test/1');
      expect(registry.get('blob:test/1')).toBeNull();
    });

    it('emits changed event when evicted', () => {
      registry.set('blob:test/1', makeAsset());
      const listener = vi.fn();
      registry.on('changed', listener);
      registry.evict('blob:test/1');
      expect(listener).toHaveBeenCalledOnce();
    });

    it('does not emit when evicting unknown URL', () => {
      const listener = vi.fn();
      registry.on('changed', listener);
      registry.evict('blob:unknown');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── evictByPath ────────────────────────────────────────────────────────────

  describe('evictByPath', () => {
    it('removes entry by path and returns true', () => {
      registry.set('blob:test/1', makeAsset(), 'prefabs/chair.prefab');
      const result = registry.evictByPath('prefabs/chair.prefab');
      expect(result).toBe(true);
      expect(registry.get('blob:test/1')).toBeNull();
      expect(registry.getURLForPath('prefabs/chair.prefab')).toBeNull();
    });

    it('returns false for unknown path', () => {
      expect(registry.evictByPath('prefabs/unknown.prefab')).toBe(false);
    });
  });

  // ── clear ──────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all entries', () => {
      registry.set('blob:1', makeAsset({ id: 'a' }));
      registry.set('blob:2', makeAsset({ id: 'b' }));
      registry.clear();
      expect(registry.getAllAssets()).toHaveLength(0);
    });

    it('emits changed event', () => {
      const listener = vi.fn();
      registry.on('changed', listener);
      registry.clear();
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── getAllAssets ───────────────────────────────────────────────────────────

  describe('getAllAssets', () => {
    it('returns all cached assets', () => {
      const a1 = makeAsset({ id: 'a1', name: 'A1' });
      const a2 = makeAsset({ id: 'a2', name: 'A2' });
      registry.set('blob:1', a1);
      registry.set('blob:2', a2);
      const all = registry.getAllAssets();
      expect(all).toHaveLength(2);
      expect(all).toContain(a1);
      expect(all).toContain(a2);
    });
  });

  // ── listeners ─────────────────────────────────────────────────────────────

  describe('on / off', () => {
    it('stops emitting after off()', () => {
      const listener = vi.fn();
      registry.on('changed', listener);
      registry.set('blob:1', makeAsset());
      registry.off('changed', listener);
      registry.set('blob:2', makeAsset({ id: 'b' }));
      expect(listener).toHaveBeenCalledOnce(); // only from the first set
    });
  });
});
