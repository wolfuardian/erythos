import type { Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { setConfirmBeforeLoad } from '../../app/bridge';
import { PanelHeader } from '../../components/PanelHeader';

const SettingsPanel: Component = () => {
  const bridge = useEditor();

  const handleConfirmToggle = () => {
    setConfirmBeforeLoad(!bridge.confirmBeforeLoad());
  };

  return (
    <div style={{
      width: 'calc(100% - 6px)',
      height: '100%',
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
      background: 'var(--bg-panel)',
      'box-shadow': 'var(--shadow-well-outer)',
      'border-radius': 'var(--radius-lg)',
      margin: '0 3px',
      'box-sizing': 'border-box',
    }}>
      <PanelHeader title="Settings" />
      <div style={{ flex: '1', overflow: 'auto', padding: 'var(--space-md)' }}>
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
    </div>
  );
};

export default SettingsPanel;
