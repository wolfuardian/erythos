import { describe, it, expect, beforeEach } from 'vitest';
import { PrefabGraph, CircularReferenceError } from '../../io/PrefabGraph';

describe('PrefabGraph', () => {
  let graph: PrefabGraph;

  beforeEach(() => {
    graph = new PrefabGraph();
  });

  // -- wouldCreateCycle --------------------------------------------------

  describe('wouldCreateCycle', () => {
    it('returns false for empty graph', () => {
      expect(graph.wouldCreateCycle('prefabs://a', 'prefabs://b')).toBe(false);
    });

    it('detects self-reference (A -> A)', () => {
      expect(graph.wouldCreateCycle('prefabs://a', 'prefabs://a')).toBe(true);
    });

    it('detects 2-hop cycle: A->B, adding B->A', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      expect(graph.wouldCreateCycle('prefabs://b', 'prefabs://a')).toBe(true);
    });

    it('detects 3-hop cycle: A->B->C, adding C->A', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      graph.addEdge('prefabs://b', 'prefabs://c');
      expect(graph.wouldCreateCycle('prefabs://c', 'prefabs://a')).toBe(true);
    });

    it('detects N-hop cycle (4 hops)', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      graph.addEdge('prefabs://b', 'prefabs://c');
      graph.addEdge('prefabs://c', 'prefabs://d');
      // Adding d->a would close: a->b->c->d->a
      expect(graph.wouldCreateCycle('prefabs://d', 'prefabs://a')).toBe(true);
    });

    it('does NOT flag a valid non-cycle reference', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      graph.addEdge('prefabs://b', 'prefabs://c');
      // Adding d->a is fine -- d is new and has no deps
      expect(graph.wouldCreateCycle('prefabs://d', 'prefabs://a')).toBe(false);
    });

    it('shared dep without cycle: A->C, B->C, adding A->B is fine', () => {
      graph.addEdge('prefabs://a', 'prefabs://c');
      graph.addEdge('prefabs://b', 'prefabs://c');
      expect(graph.wouldCreateCycle('prefabs://a', 'prefabs://b')).toBe(false);
    });

    it('diamond without cycle: A->B, A->C, B->D, C->D -- adding E->A is fine', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      graph.addEdge('prefabs://a', 'prefabs://c');
      graph.addEdge('prefabs://b', 'prefabs://d');
      graph.addEdge('prefabs://c', 'prefabs://d');
      // D does not depend on A, so adding A depends on D is fine
      expect(graph.wouldCreateCycle('prefabs://a', 'prefabs://d')).toBe(false);
    });

    it('duplicate reference to same dep is NOT a cycle', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      // Re-adding the same edge is not a cycle
      expect(graph.wouldCreateCycle('prefabs://a', 'prefabs://b')).toBe(false);
    });
  });

  // -- assertNoCycle -----------------------------------------------------

  describe('assertNoCycle', () => {
    it('does not throw when no cycle', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      expect(() => graph.assertNoCycle('prefabs://b', 'prefabs://c')).not.toThrow();
    });

    it('throws CircularReferenceError on self-ref', () => {
      expect(() => graph.assertNoCycle('prefabs://a', 'prefabs://a'))
        .toThrow(CircularReferenceError);
    });

    it('throws CircularReferenceError on 2-hop cycle', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      expect(() => graph.assertNoCycle('prefabs://b', 'prefabs://a'))
        .toThrow(CircularReferenceError);
    });

    it('error message contains cycle chain with readable labels', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      try {
        graph.assertNoCycle('prefabs://b', 'prefabs://a');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CircularReferenceError);
        const err = e as CircularReferenceError;
        // Message should contain human-readable labels (not full URLs necessarily)
        expect(err.message).toContain('b');
        expect(err.message).toContain('a');
        expect(err.cycle).toBeTruthy();
      }
    });

    it('error has correct name', () => {
      expect(() => graph.assertNoCycle('prefabs://a', 'prefabs://a'))
        .toThrowError(expect.objectContaining({ name: 'CircularReferenceError' }));
    });
  });

  // -- cache invalidation ------------------------------------------------

  describe('cache invalidation', () => {
    it('invalidate re-computes deps on next getDeps call', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      const deps1 = graph.getDeps('prefabs://a');
      expect(deps1.has('prefabs://b')).toBe(true);

      // invalidate a; getDeps should still return correct result
      graph.invalidate('prefabs://a');
      const deps2 = graph.getDeps('prefabs://a');
      expect(deps2.has('prefabs://b')).toBe(true);
    });

    it('adding an edge invalidates the from-node cache', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      graph.getDeps('prefabs://a'); // warm cache
      graph.addEdge('prefabs://a', 'prefabs://c');
      const deps = graph.getDeps('prefabs://a');
      expect(deps.has('prefabs://c')).toBe(true);
    });
  });

  // -- clear -------------------------------------------------------------

  describe('clear', () => {
    it('clears all edges and cache', () => {
      graph.addEdge('prefabs://a', 'prefabs://b');
      graph.addEdge('prefabs://b', 'prefabs://c');
      graph.clear();
      expect(graph.wouldCreateCycle('prefabs://b', 'prefabs://a')).toBe(false);
      expect(graph.getDeps('prefabs://a').size).toBe(0);
    });
  });
});
