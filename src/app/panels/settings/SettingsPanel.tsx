import type { Component } from 'solid-js';
import { useEditor } from '../../EditorContext';

const SettingsPanel: Component = () => {
  useEditor(); // bridge available for future settings

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-md)',
    }}>
      <h3 style={{
        margin: 0,
        'font-size': 'var(--font-size-md)',
        color: 'var(--text-primary)',
        'font-weight': 600,
      }}>
        Settings
      </h3>
    </div>
  );
};

export default SettingsPanel;
