import type { SceneNode } from './SceneFormat';
import type { SceneDocument } from './SceneDocument';
import type { ProjectManager } from '../project/ProjectManager';
import { serializeToPrefab } from './PrefabSerializer';
import { findPrefabInstanceRoot } from './PrefabInstance';
import type { AssetPath, NodeUUID } from '../../utils/branded';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * How long to wait (ms) after the last mutation before serializing and writing.
 * Debounce collapses rapid successive edits into a single write.
 */
const DEBOUNCE_MS = 250;

/**
 * Grace window (ms) after a self-triggered writeFile during which the watcher:
 *   1. Will not schedule a new write for that path (suppresses cascade from
 *      nodeAdded/nodeRemoved events fired by SceneSync's rebuild of other instances).
 *   2. SceneSync will skip rebuild of the originating instance root.
 *
 * Must comfortably exceed the round-trip time:
 *   writeFile → ProjectManager.fileChanged → PrefabRegistry fetch (async HTTP) →
 *   prefabChanged → SceneSync._rebuildPrefabInstances
 *
 * 50ms is a fallback for external file edits or unforeseen event paths. The primary
 * guard against rebuild-echo is the `suppress()` wrap around InstantiatePrefabCommand
 * and SceneSync._rebuildPrefabInstances. If storage is exceptionally slow and the
 * fallback window is exceeded, the worst outcome is the originating instance receives
 * a redundant (but functionally correct) rebuild once.
 */
export const SELF_WRITE_WINDOW_MS = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingWrite {
  /** The instance root UUID that originated the most-recent mutation before debounce settled. */
  originatingInstanceRootId: NodeUUID;
  /** setTimeout handle; cleared when another mutation extends the debounce. */
  timeoutHandle: ReturnType<typeof setTimeout>;
}

interface SelfWriteEntry {
  /** Instance root UUID at the time writeFile fired (used by SceneSync skip check). */
  instanceRootId: NodeUUID;
  /** Absolute timestamp after which this entry should no longer suppress writes. */
  until: number;
}

// ── PrefabInstanceWatcher ─────────────────────────────────────────────────────

/**
 * Watches SceneDocument mutations inside prefab instance subtrees and writes
 * back to the corresponding `.prefab` file after a 250ms debounce.
 *
 * Self-write loop avoidance (two-level):
 *   Level 1 — Watcher-internal: if a path is within its SELF_WRITE_WINDOW_MS
 *     grace window, incoming mutation events for that path are dropped (no
 *     debounce scheduled). This prevents the nodeAdded/nodeRemoved events
 *     emitted by SceneSync rebuilding *other* instances from triggering a
 *     second write cascade.
 *   Level 2 — SceneSync query: SceneSync calls `hasRecentSelfWrite(path, id)`
 *     before rebuilding an instance. The originating instance (the one whose
 *     edit triggered the write) is skipped; all other instances rebuild normally.
 *
 * Lifecycle:
 *   - Constructor subscribes to SceneDocument events immediately.
 *   - `dispose()` clears all pending debounce timers and removes all listeners.
 */
export class PrefabInstanceWatcher {
  private readonly _document: SceneDocument;
  private readonly _projectManager: ProjectManager;

  /** path → pending debounce state */
  private readonly _pending = new Map<AssetPath, PendingWrite>();

  /** path → self-write grace window entry */
  private readonly _selfWrites = new Map<AssetPath, SelfWriteEntry>();

  /**
   * Re-entrant suppress counter. While > 0, ALL nodeAdded/nodeRemoved/nodeChanged
   * events are completely ignored (no debounce scheduled). Use `suppress()` to
   * increment/decrement atomically around a block of SceneDocument mutations that
   * must not trigger a write (e.g. InstantiatePrefabCommand.execute, SceneSync rebuild).
   */
  private _suppressDepth = 0;

  // Bound handlers so we can pass the same reference to off()
  private readonly _onNodeAdded: (node: SceneNode) => void;
  private readonly _onNodeRemoved: (node: SceneNode) => void;
  private readonly _onNodeChanged: (uuid: NodeUUID) => void;

  constructor(
    sceneDocument: SceneDocument,
    projectManager: ProjectManager,
  ) {
    this._document = sceneDocument;
    this._projectManager = projectManager;

    this._onNodeAdded   = (node) => this._handleMutation(node.id);
    // For nodeRemoved: the node is already deleted from SceneDocument by the time the event fires.
    // We cannot use getAllNodes() to find its instance root — instead use node.parent from the
    // event payload directly to walk up what's left of the tree.
    this._onNodeRemoved = (node) => this._handleRemovedMutation(node);
    this._onNodeChanged = (uuid) => this._handleMutation(uuid);

    sceneDocument.events.on('nodeAdded',   this._onNodeAdded);
    sceneDocument.events.on('nodeRemoved', this._onNodeRemoved);
    sceneDocument.events.on('nodeChanged', this._onNodeChanged);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Query used by SceneSync before rebuilding an instance subtree.
   *
   * Returns `true` if:
   *   - A write for `path` was triggered by THIS watcher within the last SELF_WRITE_WINDOW_MS, AND
   *   - The originating instance root was `instanceRootId`.
   *
   * When true, SceneSync should skip the rebuild for that specific instance to
   * avoid overwriting the user's in-progress edit with a round-trip echo.
   * Other instances (different instanceRootId) always return false and rebuild normally.
   */
  hasRecentSelfWrite(path: AssetPath, instanceRootId: NodeUUID): boolean {
    const entry = this._selfWrites.get(path);
    if (!entry) return false;
    if (Date.now() > entry.until) {
      this._selfWrites.delete(path);
      return false;
    }
    return entry.instanceRootId === instanceRootId;
  }

  /**
   * Execute `fn` with all mutation-event scheduling silenced.
   *
   * While `fn` is running, any `nodeAdded`, `nodeRemoved`, or `nodeChanged`
   * event fired against this watcher's SceneDocument will be completely ignored
   * — no debounce is armed, no write is scheduled.
   *
   * The counter is re-entrant / nestable: nested `suppress()` calls simply
   * increment/decrement the depth; scheduling resumes only when the outermost
   * call returns.
   *
   * Intended callers:
   *   - `InstantiatePrefabCommand.execute()` — adding freshly-deserialized nodes
   *     must not be treated as a "user edited a prefab" mutation.
   *   - `SceneSync._rebuildPrefabInstances` per-instance loop — rebuild-echo
   *     mutations must not re-arm the debounce. This is the primary guard;
   *     the 50ms self-write window (Level 1) is a fallback for external file
   *     edits or unforeseen event paths.
   */
  suppress<T>(fn: () => T): T {
    this._suppressDepth++;
    try {
      return fn();
    } finally {
      this._suppressDepth--;
    }
  }

  /**
   * Cancel all pending debounce timers and remove all event listeners.
   * Safe to call multiple times.
   */
  dispose(): void {
    this._document.events.off('nodeAdded',   this._onNodeAdded);
    this._document.events.off('nodeRemoved', this._onNodeRemoved);
    this._document.events.off('nodeChanged', this._onNodeChanged);

    for (const { timeoutHandle } of this._pending.values()) {
      clearTimeout(timeoutHandle);
    }
    this._pending.clear();
    this._selfWrites.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Handle nodeRemoved events. Because SceneDocument deletes the node before emitting,
   * we cannot use getAllNodes() to walk ancestry. Instead we use the node's parent
   * (from the event payload) and walk from there.
   */
  private _handleRemovedMutation(removedNode: SceneNode): void {
    if (removedNode.parent === null) return; // top-level removal, nothing to walk up

    // The removed node's parent is still in the document — walk from there
    const allNodes = this._document.getAllNodes();

    // Check if the parent itself is the prefab instance root
    const parent = this._document.getNode(removedNode.parent);
    if (!parent) return;

    // If parent is a prefab instance root, the removal is directly inside it
    if (parent.components['prefab']) {
      const prefabComp = parent.components['prefab'] as { path?: AssetPath } | undefined;
      const prefabPath = prefabComp?.path;
      if (prefabPath) this._scheduleWrite(prefabPath, parent.id);
      return;
    }

    // Otherwise, walk ancestry from the parent upwards
    const instanceRootId = findPrefabInstanceRoot(removedNode.parent, allNodes);
    if (instanceRootId === null) return;

    const instanceRoot = this._document.getNode(instanceRootId);
    if (!instanceRoot) return;

    const prefabComp = instanceRoot.components['prefab'] as { path?: AssetPath } | undefined;
    const prefabPath = prefabComp?.path;
    if (prefabPath) this._scheduleWrite(prefabPath, instanceRootId);
  }

  private _handleMutation(nodeId: NodeUUID): void {
    const allNodes = this._document.getAllNodes();

    // Walk ancestry to find the enclosing prefab instance root
    const instanceRootId = findPrefabInstanceRoot(nodeId, allNodes);
    if (instanceRootId === null) {
      // Also handle the case where nodeId IS the instance root itself (e.g. root name changed)
      // findPrefabInstanceRoot only searches ancestors, not self — check self separately
      const self = this._document.getNode(nodeId);
      if (!self?.components['prefab']) return; // Not a prefab root, ignore
      // A mutation on the instance root itself (e.g. name) — we still skip
      // writing because per-instance root fields are "per-instance" not shared.
      return;
    }

    const instanceRoot = this._document.getNode(instanceRootId);
    if (!instanceRoot) return;

    const prefabComp = instanceRoot.components['prefab'] as { path?: AssetPath } | undefined;
    const prefabPath = prefabComp?.path;
    if (!prefabPath) return;

    this._scheduleWrite(prefabPath, instanceRootId);
  }

  /**
   * Schedule (or re-arm) a debounced write for `prefabPath` originating from `instanceRootId`.
   *
   * Skips silently if:
   *   - suppress depth > 0 (suppress() is active — e.g. during InstantiatePrefabCommand or
   *     SceneSync._rebuildPrefabInstances). This is the primary guard against spurious writes.
   *   - a self-write grace window is active for the path (Level 1 fallback — covers external
   *     file edits or event paths not wrapped by suppress()).
   *
   * 50ms is a fallback for external file edits or unforeseen event paths. The primary guard
   * against rebuild-echo is the `suppress()` wrap around InstantiatePrefabCommand and
   * SceneSync._rebuildPrefabInstances.
   */
  private _scheduleWrite(prefabPath: AssetPath, instanceRootId: NodeUUID): void {
    // Primary guard: if suppress() is active, completely ignore this mutation.
    if (this._suppressDepth > 0) return;

    // Level 1 cascade suppression (fallback): if we already wrote this path recently,
    // the current events are the echo from SceneSync rebuilding other instances.
    // Drop without scheduling another write.
    const existing = this._selfWrites.get(prefabPath);
    if (existing && Date.now() <= existing.until) return;

    // Cancel any prior pending debounce for this path and start a new one
    const prior = this._pending.get(prefabPath);
    if (prior) clearTimeout(prior.timeoutHandle);

    const timeoutHandle = setTimeout(
      () => this._flushWrite(prefabPath, instanceRootId),
      DEBOUNCE_MS,
    );
    this._pending.set(prefabPath, { originatingInstanceRootId: instanceRootId, timeoutHandle });
  }

  private _flushWrite(prefabPath: AssetPath, instanceRootId: NodeUUID): void {
    this._pending.delete(prefabPath);

    // Re-read instance root to make sure it still exists and has the same prefab path
    const instanceRoot = this._document.getNode(instanceRootId);
    if (!instanceRoot) return;
    const prefabComp = instanceRoot.components['prefab'] as { path?: AssetPath } | undefined;
    if (prefabComp?.path !== prefabPath) return;

    // Serialize the entire subtree rooted at instanceRootId (children only)
    const allNodes = this._document.getAllNodes();
    const asset = serializeToPrefab(instanceRootId, allNodes, instanceRoot.name);

    // Register self-write BEFORE calling writeFile so the echo arrives after
    this._selfWrites.set(prefabPath, {
      instanceRootId,
      until: Date.now() + SELF_WRITE_WINDOW_MS,
    });

    void this._projectManager.writeFile(prefabPath, JSON.stringify(asset))
      .catch((err) => {
        console.warn(`[PrefabInstanceWatcher] writeFile failed for "${prefabPath}":`, err);
      });
  }
}
