import { type Component } from 'solid-js';

// TODO: import { useEditor } from '../../EditorContext' when reading scene context

const ContextPanel: Component = () => {
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
