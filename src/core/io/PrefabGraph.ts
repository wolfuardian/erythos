/**
 * PrefabGraph — in-memory DAG edge store for prefab-to-prefab reference tracking.
 *
 * Tracks which prefab asset URLs a given asset URL depends on (directly or transitively).
 * Used to detect cycles before allowing a new reference to be created.
 *
 * Cache invalidation: call invalidate(assetUrl) when a prefab asset is written/removed.
 *
 * API:
 *   wouldCreateCycle(host, target) → boolean
 *     Returns true if adding an edge host→target would create a cycle
 *     (i.e. target transitively depends on host, so host→target closes the loop).
 *
 *   addEdge(host, target) — register a dependency
 *   invalidate(assetUrl) — evict cached transitive deps for assetUrl
 *   clear() — reset all state
 */

export class CircularReferenceError extends Error {
  constructor(public readonly cycle: string) {
    super(`Circular prefab reference detected: ${cycle}`);
    this.name = 'CircularReferenceError';
  }
}

export class PrefabGraph {
  /** Direct edges: assetUrl → set of assetUrls it directly references */
  private readonly _edges = new Map<string, Set<string>>();
  /** Cached transitive dependency sets (lazy, invalidated on write) */
  private readonly _depsCache = new Map<string, Set<string>>();

  /**
   * Register a direct dependency edge: `from` references `to`.
   * Invalidates the deps cache for `from`.
   */
  addEdge(from: string, to: string): void {
    let set = this._edges.get(from);
    if (!set) {
      set = new Set();
      this._edges.set(from, set);
    }
    set.add(to);
    this._depsCache.delete(from);
  }

  /**
   * Remove a direct dependency edge: `from` no longer references `to`.
   * Invalidates the deps cache for `from`.
   */
  removeEdge(from: string, to: string): void {
    const set = this._edges.get(from);
    if (set) {
      set.delete(to);
      if (set.size === 0) this._edges.delete(from);
    }
    this._depsCache.delete(from);
  }

  /**
   * Replace all direct edges for `from` with the given set of targets.
   * Used when a prefab's entire reference list is rewritten.
   */
  setEdges(from: string, targets: Iterable<string>): void {
    const set = new Set(targets);
    if (set.size === 0) {
      this._edges.delete(from);
    } else {
      this._edges.set(from, set);
    }
    this._depsCache.delete(from);
  }

  /**
   * Invalidate the transitive-deps cache for `assetUrl`.
   * Call this when a prefab file is written or removed so that
   * next getDeps() call recomputes from fresh edges.
   */
  invalidate(assetUrl: string): void {
    this._depsCache.delete(assetUrl);
    // Also invalidate any node whose transitive deps went through assetUrl
    for (const [k, deps] of this._depsCache) {
      if (deps.has(assetUrl)) this._depsCache.delete(k);
    }
  }

  /**
   * Get all transitive dependencies of `assetUrl` (NOT including itself).
   * Result is cached until invalidate() is called.
   */
  getDeps(assetUrl: string): Set<string> {
    const cached = this._depsCache.get(assetUrl);
    if (cached) return cached;

    const visited = new Set<string>();
    this._dfs(assetUrl, visited, new Set<string>());
    // Remove self from the visited set (self-loops detected separately)
    visited.delete(assetUrl);
    this._depsCache.set(assetUrl, visited);
    return visited;
  }

  private _dfs(node: string, visited: Set<string>, pathSet: Set<string>): void {
    pathSet.add(node);
    const neighbors = this._edges.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          if (!pathSet.has(neighbor)) {
            this._dfs(neighbor, visited, pathSet);
          }
        }
      }
    }
    pathSet.delete(node);
  }

  /**
   * Check whether adding a new edge host→target would create a cycle.
   *
   * A cycle exists if target already (transitively) depends on host,
   * because adding host→target would then close the loop:
   *   host → target → ... → host
   *
   * Also handles self-reference: wouldCreateCycle(X, X) → true.
   *
   * @param host   The asset URL that would be the source of the new edge
   * @param target The asset URL that would be the new dependency
   * @returns true if the edge would create a cycle
   */
  wouldCreateCycle(host: string, target: string): boolean {
    if (host === target) return true;
    return this.getDeps(target).has(host);
  }

  /**
   * Like wouldCreateCycle but throws CircularReferenceError with a path description.
   *
   * @throws CircularReferenceError with message containing the cycle chain
   */
  assertNoCycle(host: string, target: string): void {
    if (!this.wouldCreateCycle(host, target)) return;

    // Build human-readable cycle chain
    const chain = this._findCyclePath(host, target);
    throw new CircularReferenceError(chain);
  }

  private _findCyclePath(host: string, target: string): string {
    if (host === target) {
      const label = this._shortLabel(host);
      return `${label} → ${label}`;
    }

    // BFS from target to find shortest path back to host
    const parent = new Map<string, string>();
    const queue: string[] = [target];
    parent.set(target, '');

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this._edges.get(current);
      if (!neighbors) continue;
      for (const nb of neighbors) {
        if (nb === host) {
          parent.set(nb, current);
          // Reconstruct path: host → target → ... → host
          const pathFromTarget: string[] = [];
          let cursor: string = nb;
          while (cursor !== '') {
            pathFromTarget.push(cursor);
            cursor = parent.get(cursor) ?? '';
          }
          const pathLabels = [
            this._shortLabel(host),
            ...pathFromTarget.slice(1).reverse().map(u => this._shortLabel(u)),
            this._shortLabel(host),
          ];
          return pathLabels.join(' → ');
        }
        if (!parent.has(nb)) {
          parent.set(nb, current);
          queue.push(nb);
        }
      }
    }

    // Fallback: simple two-hop description
    return `${this._shortLabel(host)} → ${this._shortLabel(target)} → ${this._shortLabel(host)}`;
  }

  private _shortLabel(assetUrl: string): string {
    // "prefabs://tree-pine" → "tree-pine"
    // "prefabs://a/b" → "b"
    const match = assetUrl.match(/[^/]+$/);
    return match ? match[0] : assetUrl;
  }

  /** Remove all state. */
  clear(): void {
    this._edges.clear();
    this._depsCache.clear();
  }
}
