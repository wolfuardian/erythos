import type { Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';

const LeafPanel: Component = () => {
  const bridge = useEditor();

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      padding: 'var(--space-md)',
      'box-sizing': 'border-box',
      color: 'var(--text-secondary)',
      'font-size': 'var(--font-size-sm)',
    }}>
      <div style={{
        color: 'var(--text-muted)',
        'font-size': 'var(--font-size-xs)',
        'margin-bottom': 'var(--space-md)',
        'text-transform': 'uppercase',
        'letter-spacing': '0.5px',
      }}>
        Leaves ({bridge.leafAssets().length})
      </div>
      <div style={{ color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)' }}>
        {bridge.leafAssets().length === 0
          ? 'No leaves saved. Right-click a node in the Scene tree to save as leaf.'
          : bridge.leafAssets().map(a => a.name).join(', ')}
      </div>
    </div>
  );
};

export default LeafPanel;
