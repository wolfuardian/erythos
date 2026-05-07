import type { SceneNode, NodeType } from './SceneFormat';

/**
 * Map from v1 nodeType to the display/icon category.
 * In v1 we have a flat nodeType on each SceneNode — no inference needed from components.
 * This function re-exports the spec NodeType, serving as the boundary used by panels/icons.
 *
 * Returns the node's nodeType directly. No components bag to inspect.
 */
export function inferNodeType(node: SceneNode): NodeType {
  return node.nodeType;
}

// Re-export NodeType so callers don't need to import from SceneFormat directly.
export type { NodeType };
