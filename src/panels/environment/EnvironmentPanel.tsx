import { For, Show, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { PanelHeader } from '../../components/PanelHeader';
import { NumberDrag } from '../../components/NumberDrag';
import { SetEnvironmentCommand } from '../../core/commands';
import styles from './EnvironmentPanel.module.css';

const EnvironmentPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const env = () => bridge.environmentSettings();

  const handleClear = () => {
    editor.setEnvironmentSettings({ hdrUrl: null });
  };

  const projectHdrFiles = () => bridge.projectFiles().filter((f) => f.type === 'hdr');

  const handleSelectFromProject = async (path: string) => {
    if (!path) return;
    const file = await editor.projectManager.readFile(path);
    const blob = new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    editor.setEnvironmentSettings({ hdrUrl: url });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div data-testid="environment-panel" class={styles.panel}>
      {/* Header */}
      <PanelHeader title="Environment" />

      {/* Body */}
      <div class={styles.body}>

      {/* HDR Image section */}
      <div class={styles.section}>
        <div class={styles.sectionLabel}>HDR Image</div>

        <Show when={env().hdrUrl}>
          <div class={styles.hdrRow}>
            <span class={styles.hdrUrl}>
              {env().hdrUrl}
            </span>
            <button
              onClick={handleClear}
              class={styles.clearBtn}
            >×</button>
          </div>
        </Show>
      </div>

      {/* Project HDR Dropdown */}
      <div class={styles.section}>
        <div class={styles.sectionLabel}>From Project</div>
        <select
          value=""
          onChange={(e) => void handleSelectFromProject(e.target.value)}
          class={styles.select}
        >
          <option value="">From project…</option>
          <For each={projectHdrFiles()}>
            {(f) => <option value={f.path}>{f.name || f.path}</option>}
          </For>
        </select>
      </div>

      {/* Intensity */}
      <div class={styles.fieldSection}>
        <div class={styles.fieldLabel}>
          <span>Intensity</span>
        </div>
        <NumberDrag
          value={env().intensity}
          min={0}
          max={3}
          step={0.05}
          precision={2}
          onChange={(v) => {
            editor.execute(new SetEnvironmentCommand(editor, 'intensity', v, env().intensity));
          }}
          onDragEnd={() => editor.history.sealLast()}
        />
      </div>

      {/* Rotation */}
      <div>
        <div class={styles.fieldLabel}>
          <span>Rotation</span>
        </div>
        <NumberDrag
          value={env().rotation}
          min={0}
          max={360}
          step={1}
          precision={0}
          onChange={(v) => {
            editor.execute(new SetEnvironmentCommand(editor, 'rotation', v, env().rotation));
          }}
          onDragEnd={() => editor.history.sealLast()}
        />
      </div>
      </div>
    </div>
  );
};

export default EnvironmentPanel;
