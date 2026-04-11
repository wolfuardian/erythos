import { createMemo, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';

const ContextPanel: Component = () => {
  const bridge = useEditor();

  const sceneJson = createMemo(() => {
    bridge.sceneVersion(); // reactive dependency — re-runs on sceneGraphChanged
    const json = bridge.editor.scene.toJSON();
    return JSON.stringify(json, null, 2);
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
