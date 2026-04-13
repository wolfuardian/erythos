import { createMemo, createSignal, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';
import type { SceneNode } from '../../../core/scene/SceneFormat';

function buildTree(root: SceneNode, allNodes: SceneNode[]): object {
  const children = allNodes
    .filter(n => n.parent === root.id)
    .sort((a, b) => a.order - b.order)
    .map(child => buildTree(child, allNodes));
  if (children.length > 0) {
    return { ...root, children };
  }
  return { ...root };
}

const ContextPanel: Component = () => {
  const bridge = useEditor();
  const [showTree, setShowTree] = createSignal(false);

  const sceneJson = createMemo(() => {
    const uuids = bridge.selectedUUIDs();
    bridge.sceneVersion(); // reactive dep — re-runs on full scene replacement (load/import)
    bridge.nodes();        // reactive dep — re-runs on any node add/remove/change
    if (uuids.length > 0) {
      const node = bridge.getNode(uuids[0]);
      if (showTree() && node) {
        return JSON.stringify(buildTree(node, bridge.nodes()), null, 2);
      }
      return JSON.stringify(node, null, 2);
    }
    return JSON.stringify(bridge.editor.sceneDocument.serialize(), null, 2);
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-md)',
    }}>
      <div style={{
        display: 'flex',
        'align-items': 'center',
        gap: 'var(--space-sm)',
        'margin-bottom': 'var(--space-md)',
      }}>
        <input
          type="checkbox"
          checked={showTree()}
          onChange={(e) => setShowTree(e.currentTarget.checked)}
          id="show-tree-toggle"
        />
        <label
          for="show-tree-toggle"
          style={{
            color: 'var(--text-secondary)',
            'font-size': 'var(--font-size-sm)',
            cursor: 'pointer',
            'user-select': 'none',
          }}
        >
          Show Tree
        </label>
      </div>

      <pre style={{
        margin: '0',
        color: 'var(--text-primary)',
        'font-size': 'var(--font-size-sm)',
        'white-space': 'pre-wrap',
        'word-break': 'break-all',
      }}>
        {sceneJson()}
      </pre>
    </div>
  );
};

export default ContextPanel;
