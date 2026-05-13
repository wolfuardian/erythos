import { For, Show, type Component } from 'solid-js';
import { useEditor } from '../../../app/EditorContext';
import { NumberDrag } from '../../../components/NumberDrag';
import { SetEnvironmentCommand } from '../../../core/commands';
import type { AssetPath } from '../../../utils/branded';
import { asAssetPath } from '../../../utils/branded';
import styles from './EnvironmentDraw.module.css';

const EnvironmentDraw: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const env = () => bridge.environmentSettings();

  const handleClear = () => {
    if (bridge.editorReadOnly()) return;
    editor.setEnvironmentSettings({ hdri: null });
  };

  const projectHdrFiles = () => bridge.projectFiles().filter((f) => f.type === 'hdr');

  const handleSelectFromProject = async (path: AssetPath) => {
    if (!path || bridge.editorReadOnly()) return;
    // Store the project:// URL in SceneEnv.hdri for persistence
    // Viewport resolves it at render time
    editor.setEnvironmentSettings({ hdri: `project://${path}` });
  };

  return (
    <div>
      {/* HDR Image section */}
      <div class={styles.section}>
        <div class={styles.sectionLabel}>HDR Image</div>
        <Show when={env().hdri}>
          <div class={styles.hdrRow}>
            <span class={styles.hdrUrl}>{env().hdri}</span>
            <button onClick={handleClear} class={styles.clearBtn}>×</button>
          </div>
        </Show>
      </div>

      {/* Project HDR Dropdown */}
      <div class={styles.section}>
        <div class={styles.sectionLabel}>From Project</div>
        <select
          value=""
          onChange={(e) => void handleSelectFromProject(asAssetPath(e.target.value))}
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
        <div class={styles.fieldLabel}>Intensity</div>
        <NumberDrag
          value={env().intensity}
          min={0}
          max={3}
          step={0.05}
          precision={2}
          onChange={(v) => {
            if (bridge.editorReadOnly()) return;
            editor.execute(new SetEnvironmentCommand(editor, 'intensity', v, env().intensity));
          }}
          onDragEnd={() => editor.history.sealLast()}
        />
      </div>

      {/* Rotation */}
      <div class={styles.fieldSection}>
        <div class={styles.fieldLabel}>Rotation</div>
        <NumberDrag
          value={env().rotation}
          min={0}
          max={360}
          step={1}
          precision={0}
          onChange={(v) => {
            if (bridge.editorReadOnly()) return;
            editor.execute(new SetEnvironmentCommand(editor, 'rotation', v, env().rotation));
          }}
          onDragEnd={() => editor.history.sealLast()}
        />
      </div>
    </div>
  );
};

export { EnvironmentDraw };
