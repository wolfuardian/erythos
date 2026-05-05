import type { SceneNode } from './SceneFormat';
import type { NodeUUID } from '../../utils/branded';

/**
 * Returns true if `nodeId` is a descendant of a prefab instance root.
 *
 * A node is a prefab descendant if any ancestor (excluding the node itself)
 * has `components.prefab` set. Instance roots themselves are NOT descendants.
 *
 * @param nodeId  - The UUID of the node to test.
 * @param nodes   - Full flat node list (e.g. from bridge.nodes() or SceneDocument.getAllNodes()).
 */
export function isPrefabDescendant(nodeId: NodeUUID, nodes: SceneNode[]): boolean {
  const nodeMap = new Map<NodeUUID, SceneNode>(nodes.map(n => [n.id, n]));
  const node = nodeMap.get(nodeId);
  if (!node) return false;

  let cursor: NodeUUID | null = node.parent;
  while (cursor !== null) {
    const ancestor = nodeMap.get(cursor);
    if (!ancestor) break;
    if (ancestor.components.prefab != null) return true;
    cursor = ancestor.parent;
  }
  return false;
}

/**
 * Returns the UUID of the nearest prefab instance root that is an ancestor of `nodeId`,
 * or null if the node is not a prefab descendant.
 *
 * Useful for "select instance root instead" behaviour in viewport and scene tree.
 */
export function findPrefabInstanceRoot(nodeId: NodeUUID, nodes: SceneNode[]): NodeUUID | null {
  const nodeMap = new Map<NodeUUID, SceneNode>(nodes.map(n => [n.id, n]));
  const node = nodeMap.get(nodeId);
  if (!node) return null;

  let cursor: NodeUUID | null = node.parent;
  while (cursor !== null) {
    const ancestor = nodeMap.get(cursor);
    if (!ancestor) break;
    if (ancestor.components.prefab != null) return ancestor.id;
    cursor = ancestor.parent;
  }
  return null;
}
