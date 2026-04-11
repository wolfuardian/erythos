import { createMemo, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';

const ContextPanel: Component = () => {
  const bridge = useEditor();

  const sceneJson = createMemo(() => {
    const uuids = bridge.selectedUUIDs();
    bridge.nodes(); // reactive dep — re-runs on any node add/remove/change
    if (uuids.length > 0) {
      const node = bridge.getNode(uuids[0]);
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
