import type { Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { setConfirmBeforeLoad } from '../../app/bridge';
import { PanelHeader } from '../../components/PanelHeader';
import styles from './SettingsPanel.module.css';

const SettingsPanel: Component = () => {
  const bridge = useEditor();

  const handleConfirmToggle = () => {
    setConfirmBeforeLoad(!bridge.confirmBeforeLoad());
  };

  return (
    <div data-testid="settings-panel" class={styles.panel}>
      <PanelHeader title="Settings" />
      <div class={styles.body}>
      <label class={styles.settingRow}>
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
