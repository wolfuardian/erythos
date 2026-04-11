import { type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';

const ContextPanel: Component = () => {
  const _bridge = useEditor(); // will read scene context in future iterations

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-md)',
    }}>
      <div style={{
        color: 'var(--text-muted)',
        'font-size': 'var(--font-size-sm)',
        'text-align': 'center',
        'padding-top': 'var(--space-2xl)',
      }}>
        Context
      </div>
    </div>
  );
};

export default ContextPanel;
