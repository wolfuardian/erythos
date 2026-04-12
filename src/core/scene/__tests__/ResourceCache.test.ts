import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

describe('ResourceCache', () => {
  let cache: ResourceCache;

  beforeEach(() => {
    cache = new ResourceCache();
    _mockParser(async () => ({ scene: makeGroup('root', ['Body', 'Head']) }));
  });

  afterEach(() => {
    _clearParser();
  });

  // ── has ─────────────────────────────────────────────────────────────────────

  describe('has', () => {
    it('returns false before loading', () => {
      expect(cache.has('model.glb')).toBe(false);
    });

    it('returns true after loadFromBuffer', async () => {
      await cache.loadFromBuffer('model.glb', new ArrayBuffer(0));
      expect(cache.has('model.glb')).toBe(true);
    });

    it('distinguishes between different sources', async () => {
      await cache.loadFromBuffer('a.glb', new ArrayBuffer(0));
      expect(cache.has('a.glb')).toBe(true);
      expect(cache.has('b.glb')).toBe(false);
    });
  });

  // ── loadFromBuffer ───────────────────────────────────────────────────────────

  describe('loadFromBuffer', () => {
    it('returns the parsed Group', async () => {
      const group = await cache.loadFromBuffer('model.glb', new ArrayBuffer(0));
      expect(group).toBeInstanceOf(Group);
      expect(group.name).toBe('root');
    });

    it('overwrites existing entry for the same source', async () => {
      await cache.loadFromBuffer('model.glb', new ArrayBuffer(0));
      _clearParser();
      _mockParser(async () => ({ scene: makeGroup('updated') }));
      const group = await cache.loadFromBuffer('model.glb', new ArrayBuffer(0));
      expect(group.name).toBe('updated');
    });
  });

  // ── cloneSubtree ─────────────────────────────────────────────────────────────

  describe('cloneSubtree', () => {
    beforeEach(async () => {
      await cache.loadFromBuffer('model.glb', new ArrayBuffer(0));
    });

    it('returns null for unknown source', () => {
      expect(cache.cloneSubtree('unknown.glb')).toBeNull();
    });

    it('clones the entire root when no nodePath given', () => {
      const clone = cache.cloneSubtree('model.glb');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('root');
    });

    it('returns a clone (not the original instance)', () => {
      const clone1 = cache.cloneSubtree('model.glb');
      const clone2 = cache.cloneSubtree('model.glb');
      expect(clone1).not.toBeNull();
      expect(clone1).not.toBe(clone2);
    });

    it('finds child by nodePath (Body)', () => {
      const clone = cache.cloneSubtree('model.glb', 'Body');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('Body');
    });

    it('finds child by nodePath (Head)', () => {
      const clone = cache.cloneSubtree('model.glb', 'Head');
      expect(clone).not.toBeNull();
      expect(clone!.name).toBe('Head');
    });

    it('returns null for non-existent nodePath', () => {
      expect(cache.cloneSubtree('model.glb', 'Nonexistent')).toBeNull();
    });
  });

  // ── evict ────────────────────────────────────────────────────────────────────

  describe('evict', () => {
    it('removes the entry from cache', async () => {
      await cache.loadFromBuffer('model.glb', new ArrayBuffer(0));
      cache.evict('model.glb');
      expect(cache.has('model.glb')).toBe(false);
    });

    it('does nothing for unknown source (no throw)', () => {
      expect(() => cache.evict('unknown.glb')).not.toThrow();
    });

    it('cloneSubtree returns null after evict', async () => {
      await cache.loadFromBuffer('model.glb', new ArrayBuffer(0));
      cache.evict('model.glb');
      expect(cache.cloneSubtree('model.glb')).toBeNull();
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all entries', async () => {
      await cache.loadFromBuffer('a.glb', new ArrayBuffer(0));
      await cache.loadFromBuffer('b.glb', new ArrayBuffer(0));
      cache.clear();
      expect(cache.has('a.glb')).toBe(false);
      expect(cache.has('b.glb')).toBe(false);
    });
  });
});
