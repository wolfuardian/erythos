/**
 * PrefabInstanceWatcher — watches SceneDocument mutations inside prefab instance
 * subtrees and writes back to the corresponding `.prefab` file after debounce.
 *
 * NOTE (Phase 2 / v1): In the v1 architecture, prefab children are NOT added to
 * SceneDocument (they live only in Three.js scene graph). This means the watcher
 * is effectively dormant for in-place editing in v1 — prefab editing is deferred
 * to Phase 3. The implementation is kept structurally intact but aligned to v1
 * nodeType checks. The suppress() API is still used by InstantiatePrefabCommand.
 */

import type { SceneNode } from './SceneFormat';
import type { SceneDocument } from './SceneDocument';
import type { ProjectManager } from '../project/ProjectManager';
import { serializeToPrefab } from './PrefabSerializer';
import { findPrefabInstanceRoot } from './PrefabInstance';
import type { AssetPath, NodeUUID } from '../../utils/branded';
import { asAssetPath } from '../../utils/branded';

const DEBOUNCE_MS = 250;
export const SELF_WRITE_WINDOW_MS = 50;

interface PendingWrite {
  originatingInstanceRootId: NodeUUID;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

interface SelfWriteEntry {
  instanceRootId: NodeUUID;
  until: number;
}

/**
 * Extracts the project-relative prefab path from a prefab node's asset URL.
 * "prefabs://tree-pine" → "prefabs/tree-pine.prefab"
 */
function prefabPathFromAsset(asset: string | undefined): AssetPath | null {
  if (!asset || !asset.startsWith('prefabs://')) return null;
  const name = asset.replace('prefabs://', '');
  return asAssetPath(`prefabs/${name}.prefab`);
}

export class PrefabInstanceWatcher {
  private readonly _document: SceneDocument;
  private readonly _projectManager: ProjectManager;
  private readonly _pending = new Map<AssetPath, PendingWrite>();
  private readonly _selfWrites = new Map<AssetPath, SelfWriteEntry>();
  private _suppressDepth = 0;

  private readonly _onNodeAdded:   (node: SceneNode) => void;
  private readonly _onNodeRemoved: (node: SceneNode) => void;
  private readonly _onNodeChanged: (uuid: NodeUUID) => void;

  constructor(sceneDocument: SceneDocument, projectManager: ProjectManager) {
    this._document = sceneDocument;
    this._projectManager = projectManager;

    this._onNodeAdded   = (node) => this._handleMutation(node.id);
    this._onNodeRemoved = (node) => this._handleRemovedMutation(node);
    this._onNodeChanged = (uuid) => this._handleMutation(uuid);

    sceneDocument.events.on('nodeAdded',   this._onNodeAdded);
    sceneDocument.events.on('nodeRemoved', this._onNodeRemoved);
    sceneDocument.events.on('nodeChanged', this._onNodeChanged);
  }

  hasRecentSelfWrite(path: AssetPath, instanceRootId: NodeUUID): boolean {
    const entry = this._selfWrites.get(path);
    if (!entry) return false;
    if (Date.now() > entry.until) {
      this._selfWrites.delete(path);
      return false;
    }
    return entry.instanceRootId === instanceRootId;
  }

  suppress<T>(fn: () => T): T {
    this._suppressDepth++;
    try {
      return fn();
    } finally {
      this._suppressDepth--;
    }
  }

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

  private _handleRemovedMutation(removedNode: SceneNode): void {
    if (removedNode.parent === null) return;

    const allNodes = this._document.getAllNodes();
    const parent = this._document.getNode(removedNode.parent);
    if (!parent) return;

    // v1: check nodeType === 'prefab' instead of components.prefab
    if (parent.nodeType === 'prefab') {
      const prefabPath = prefabPathFromAsset(parent.asset);
      if (prefabPath) this._scheduleWrite(prefabPath, parent.id);
      return;
    }

    const instanceRootId = findPrefabInstanceRoot(removedNode.parent, allNodes);
    if (instanceRootId === null) return;

    const instanceRoot = this._document.getNode(instanceRootId);
    if (!instanceRoot) return;

    const prefabPath = prefabPathFromAsset(instanceRoot.asset);
    if (prefabPath) this._scheduleWrite(prefabPath, instanceRootId);
  }

  private _handleMutation(nodeId: NodeUUID): void {
    if (this._suppressDepth > 0) return;

    const allNodes = this._document.getAllNodes();
    const instanceRootId = findPrefabInstanceRoot(nodeId, allNodes);
    if (instanceRootId === null) {
      const self = this._document.getNode(nodeId);
      if (self?.nodeType !== 'prefab') return;
      // Mutation on the instance root itself — skip (per-instance fields)
      return;
    }

    const instanceRoot = this._document.getNode(instanceRootId);
    if (!instanceRoot) return;

    const prefabPath = prefabPathFromAsset(instanceRoot.asset);
    if (!prefabPath) return;

    this._scheduleWrite(prefabPath, instanceRootId);
  }

  private _scheduleWrite(prefabPath: AssetPath, instanceRootId: NodeUUID): void {
    if (this._suppressDepth > 0) return;

    const existing = this._selfWrites.get(prefabPath);
    if (existing && Date.now() <= existing.until) return;

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

    const instanceRoot = this._document.getNode(instanceRootId);
    if (!instanceRoot) return;
    const expectedPath = prefabPathFromAsset(instanceRoot.asset);
    if (expectedPath !== prefabPath) return;

    const allNodes = this._document.getAllNodes();
    const asset = serializeToPrefab(instanceRootId, allNodes, instanceRoot.name);

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
