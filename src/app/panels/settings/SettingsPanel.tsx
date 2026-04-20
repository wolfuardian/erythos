import type { Component } from 'solid-js';
import { useEditor } from '../../EditorContext';
import { setConfirmBeforeLoad } from '../../bridge';

const SettingsPanel: Component = () => {
  const bridge = useEditor();

  const handleConfirmToggle = () => {
    setConfirmBeforeLoad(!bridge.confirmBeforeLoad());
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-md)',
      'box-shadow': 'var(--shadow-well-outer)',
    }}>
      <h3 style={{
        margin: 0,
        'font-size': 'var(--font-size-md)',
        color: 'var(--text-primary)',
        'font-weight': 600,
      }}>
        Settings
      </h3>

      <label
        onMouseEnter={(e) => (e.currentTarget as HTMLLabelElement).style.background = 'var(--bg-hover)'}
        onMouseLeave={(e) => (e.currentTarget as HTMLLabelElement).style.background = ''}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: 'var(--space-sm)',
          'margin-top': 'var(--space-md)',
          padding: '4px var(--space-sm)',
          'border-radius': 'var(--radius-sm)',
          color: 'var(--text-secondary)',
          'font-size': 'var(--font-size-sm)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={bridge.confirmBeforeLoad()}
          onChange={handleConfirmToggle}
        />
        Confirm before loading scene
      </label>
    </div>
  );
};

export default SettingsPanel;
