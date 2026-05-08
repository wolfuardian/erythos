import { Command } from '../Command';
import type { Editor } from '../Editor';
import type { SceneNode } from '../scene/SceneFormat';
import type { NodeUUID } from '../../utils/branded';
import { asAssetPath } from '../../utils/branded';
import { deserializeFromPrefab } from '../scene/PrefabSerializer';

/**
 * BakeCommand — Flatten a prefab instance into independent SceneDocument nodes.
 *
 * execute():
 *   1. Look up the PrefabAsset for the selected prefab instance node.
 *   2. Use deserializeFromPrefab to convert PrefabNodes → SceneNodes with fresh UUIDs.
 *   3. Replace the prefab instance node in the SceneDocument with the flattened subtree.
 *      The root of the flattened subtree inherits the instance's parent, order, position,
 *      rotation, and scale. Each flattened node is added via sceneDocument.addNode.
 *   4. Remove the original prefab instance node.
 *
 * undo():
 *   1. Remove all flattened nodes (reverse-BFS order — leaves before parents).
 *   2. Re-add the original prefab instance node snapshot.
 *
 * Constraints:
 *   - Does NOT recurse into nested prefab instances (inner prefab nodes stay as prefab nodeType).
 *   - Does NOT modify PrefabRegistry or PrefabAsset — original prefab is unchanged.
 *   - Throws if the prefab asset cannot be resolved (execute aborts before any mutation).
 */
export class BakeCommand extends Command {
  readonly type = 'Bake';

  private readonly instanceUUID: NodeUUID;

  /** Snapshot of the original prefab instance node — used by undo() to restore. */
  private instanceSnapshot: SceneNode | null = null;

  /**
   * Flat list of baked SceneNodes added during execute().
   * BFS order (parent before children). Used by undo() to remove in reverse.
   */
  private bakedNodes: SceneNode[] = [];

  constructor(editor: Editor, instanceUUID: NodeUUID) {
    super(editor);
    this.instanceUUID = instanceUUID;
  }

  execute(): void {
    const doc = this.editor.sceneDocument;
    const instance = doc.getNode(this.instanceUUID);

    if (!instance) {
      throw new Error(`BakeCommand: node ${this.instanceUUID} not found`);
    }
    if (instance.nodeType !== 'prefab') {
      throw new Error(`BakeCommand: node ${this.instanceUUID} is not a prefab instance (nodeType=${instance.nodeType})`);
    }
    if (!instance.asset) {
      throw new Error(`BakeCommand: prefab instance ${this.instanceUUID} has no asset URL`);
    }

    // Resolve PrefabAsset from registry
    const asset = this._resolveAsset(instance.asset);
    if (!asset) {
      throw new Error(`BakeCommand: prefab asset "${instance.asset}" not found in registry`);
    }

    // Snapshot original instance for undo
    this.instanceSnapshot = structuredClone(instance);

    // Deserialize prefab into fresh SceneNodes. Root nodes (parentLocalId === null) will
    // have parent = null — we'll set them to inherit the instance's parent below.
    const rawNodes = deserializeFromPrefab(asset, null);

    if (rawNodes.length === 0) {
      // Empty prefab — just remove the instance node (bake to nothing)
      doc.removeNode(this.instanceUUID);
      this.bakedNodes = [];
      return;
    }

    // Patch the root nodes (those whose parent is null after deserialization) to
    // inherit the instance's parent, order, and transform.
    // In practice a well-formed prefab has exactly one root, but we handle multi-root.
    const patchedNodes: SceneNode[] = rawNodes.map(n => {
      if (n.parent === null) {
        // This is a root node of the prefab — inherit instance's placement
        return {
          ...n,
          parent: instance.parent,
          order:  instance.order,
          // Override position/rotation/scale with the instance's transform
          position: [...instance.position] as [number, number, number],
          rotation: [...instance.rotation] as [number, number, number],
          scale:    [...instance.scale]    as [number, number, number],
        };
      }
      return n;
    });

    // Remove the original prefab instance first
    doc.removeNode(this.instanceUUID);

    // Add flattened nodes (BFS order — parents before children, so SceneSync sees parents first)
    for (const node of patchedNodes) {
      doc.addNode(node);
    }

    this.bakedNodes = patchedNodes;
  }

  undo(): void {
    if (!this.instanceSnapshot) return;

    const doc = this.editor.sceneDocument;

    // Remove baked nodes in reverse BFS order (leaves first, then parents)
    for (let i = this.bakedNodes.length - 1; i >= 0; i--) {
      doc.removeNode(this.bakedNodes[i].id);
    }

    // Restore the original prefab instance
    doc.addNode(this.instanceSnapshot);

    // Clear state
    this.bakedNodes = [];
    this.instanceSnapshot = null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Resolve a prefabs:// URL to a PrefabAsset via the PrefabRegistry.
   * Supports both URL-keyed and path-keyed (pre-write) lookup paths.
   * Returns null if not found.
   */
  private _resolveAsset(prefabsUrl: string) {
    const registry = this.editor.prefabRegistry;

    // Derive project-relative path: "prefabs://tree-pine" → "prefabs/tree-pine.prefab"
    const prefabName = prefabsUrl.replace('prefabs://', '');
    const path = asAssetPath(`prefabs/${prefabName}.prefab`);

    // Try URL-keyed lookup first
    const url = registry.getURLForPath(path);
    if (url) {
      const asset = registry.get(url);
      if (asset) return asset;
    }

    // Fall back to pre-write path-keyed entry (race guard — mirrors SceneSync.hydratePrefab)
    return registry.getAssetByPath(path);
  }
}
