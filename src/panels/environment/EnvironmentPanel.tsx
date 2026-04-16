import type { Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';

const EnvironmentPanel: Component = () => {
  const bridge = useEditor();
  const env = () => bridge.environmentSettings();

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
        Environment
      </div>
      <div style={{ color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)' }}>
        {env().hdrUrl ? `HDR: ${env().hdrUrl}` : 'Using default RoomEnvironment'}
      </div>
    </div>
  );
};

export default EnvironmentPanel;
