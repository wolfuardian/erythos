import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Group, Object3D } from 'three';
import { ResourceCache, _mockParser, _clearParser } from '../ResourceCache';

function makeGroup(name: string, children: string[] = []): Group {
  const g = new Group();
  g.name = name;
  for (const childName of children) {
    const child = new Object3D();
    child.name = childName;
    g.add(child);
  }
  return g;
}

// Stub fetch for tests that use loadFromURL
function stubFetch(buffer: ArrayBuffer = new ArrayBuffer(0)): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => buffer,
  }));
}

describe('ResourceCache', () => {
  let cache: ResourceCache;

  beforeEach(() => {
    cache = new ResourceCache();
    _mockParser(async () => ({ scene: makeGroup('root', ['Body', 'Head']) }));
  });

  afterEach(() => {
    _clearParser();
    vi.unstubAllGlobals();
  });

  // ── has ─────────────────────────────────────────────────────────────────────

  describe('has', () => {
    it('returns false before loading', () => {
      expect(cache.has('blob:test/1')).toBe(false);
    });

    it('returns true after loadFromBuffer', async () => {
      await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
      expect(cache.has('blob:test/1')).toBe(true);
    });

    it('distinguishes between different URLs', async () => {
      await cache.loadFromBuffer('blob:test/a', new ArrayBuffer(0));
      expect(cache.has('blob:test/a')).toBe(true);
      expect(cache.has('blob:test/b')).toBe(false);
    });
  });

  // ── loadFromURL ──────────────────────────────────────────────────────────────

  describe('loadFromURL', () => {
    it('fetches URL and returns a parsed Group', async () => {
      stubFetch();
      const group = await cache.loadFromURL('blob:test/1');
      expect(group).toBeInstanceOf(Group);
      expect(group.name).toBe('root');
    });

    it('returns cached result without re-fetching on repeated calls', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      });
      vi.stubGlobal('fetch', fetchMock);

      await cache.loadFromURL('blob:test/1');
      await cache.loadFromURL('blob:test/1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws when fetch returns non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
      await expect(cache.loadFromURL('blob:test/missing')).rejects.toThrow('fetch failed');
    });
  });

  // ── loadFromBuffer ───────────────────────────────────────────────────────────

  describe('loadFromBuffer', () => {
    it('returns the parsed Group', async () => {
      const group = await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
      expect(group).toBeInstanceOf(Group);
      expect(group.name).toBe('root');
    });

    it('overwrites existing entry for the same url', async () => {
      await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
      _clearParser();
      _mockParser(async () => ({ scene: makeGroup('updated') }));
      const group = await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
      expect(group.name).toBe('updated');
    });
  });

  // ── cloneSubtree ─────────────────────────────────────────────────────────────

  describe('cloneSubtree', () => {
    beforeEach(async () => {
      await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
    });

    it('returns null for unknown url', () => {
      expect(cache.cloneSubtree('blob:test/unknown')).toBeNull();
    });

    it('clones the entire root when no nodePath given', () => {
      const clone = cache.cloneSubtree('blob:test/1');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('root');
    });

    it('returns a clone (not the original instance)', () => {
      const clone1 = cache.cloneSubtree('blob:test/1');
      const clone2 = cache.cloneSubtree('blob:test/1');
      expect(clone1).not.toBeNull();
      expect(clone1).not.toBe(clone2);
    });

    it('finds child by nodePath (Body)', () => {
      const clone = cache.cloneSubtree('blob:test/1', 'Body');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('Body');
    });

    it('finds child by nodePath (Head)', () => {
      const clone = cache.cloneSubtree('blob:test/1', 'Head');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('Head');
    });

    it('returns null for non-existent nodePath', () => {
      expect(cache.cloneSubtree('blob:test/1', 'Nonexistent')).toBeNull();
    });
  });

  // ── pipe-separated nodePath ──────────────────────────────────────────────────

  describe('pipe-separated nodePath', () => {
    beforeEach(async () => {
      // root → Body → Arm → Hand
      _mockParser(async () => {
        const root = new Group();
        root.name = 'root';
        const body = new Object3D();
        body.name = 'Body';
        const arm = new Object3D();
        arm.name = 'Arm';
        const hand = new Object3D();
        hand.name = 'Hand';
        arm.add(hand);
        body.add(arm);
        root.add(body);
        return { scene: root };
      });
      cache = new ResourceCache();
      await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
    });

    it('finds two-level nested node (Body|Arm)', () => {
      const clone = cache.cloneSubtree('blob:test/1', 'Body|Arm');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('Arm');
    });

    it('finds three-level nested node (Body|Arm|Hand)', () => {
      const clone = cache.cloneSubtree('blob:test/1', 'Body|Arm|Hand');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('Hand');
    });

    it('returns null when first segment not found', () => {
      expect(cache.cloneSubtree('blob:test/1', 'Nonexistent|Arm')).toBeNull();
    });

    it('returns null when intermediate segment not found', () => {
      expect(cache.cloneSubtree('blob:test/1', 'Body|Nonexistent|Hand')).toBeNull();
    });
  });

  // ── evict ────────────────────────────────────────────────────────────────────

  describe('evict', () => {
    it('removes the entry from cache', async () => {
      await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
      cache.evict('blob:test/1');
      expect(cache.has('blob:test/1')).toBe(false);
    });

    it('does nothing for unknown url (no throw)', () => {
      expect(() => cache.evict('blob:test/unknown')).not.toThrow();
    });

    it('cloneSubtree returns null after evict', async () => {
      await cache.loadFromBuffer('blob:test/1', new ArrayBuffer(0));
      cache.evict('blob:test/1');
      expect(cache.cloneSubtree('blob:test/1')).toBeNull();
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all entries', async () => {
      await cache.loadFromBuffer('blob:test/a', new ArrayBuffer(0));
      await cache.loadFromBuffer('blob:test/b', new ArrayBuffer(0));
      cache.clear();
      expect(cache.has('blob:test/a')).toBe(false);
      expect(cache.has('blob:test/b')).toBe(false);
    });
  });
});
