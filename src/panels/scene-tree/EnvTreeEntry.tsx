import { type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import styles from './EnvTreeEntry.module.css';

/** HDR sphere icon — stroke-based 13×13 SVG, consistent with EditorSwitcher style */
function EnvSphereIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      {/* Outer sphere circle */}
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1"/>
      {/* Horizontal equator ellipse (flattened to suggest 3D sphere) */}
      <ellipse cx="6.5" cy="6.5" rx="4.5" ry="1.6" stroke="currentColor" stroke-width="0.7" opacity="0.5"/>
      {/* Small specular highlight dot */}
      <circle cx="4.5" cy="4.5" r="0.8" fill="currentColor" opacity="0.7"/>
    </svg>
  );
}

/** Sticky Environment entry rendered above the node list in SceneTreePanel */
export const EnvTreeEntry: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const isSelected = () => bridge.isEnvSelected();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    editor.selection.selectEnv();
  };

  return (
    <div
      data-testid="env-tree-entry"
      class={styles.row}
      classList={{ [styles.selected]: isSelected() }}
      onClick={handleClick}
    >
      {/* Selected accent bar */}
      {isSelected() && <div class={styles.selectedBar} />}

      {/* Icon */}
      <span class={styles.envIcon}>
        <EnvSphereIcon />
      </span>

      {/* Label */}
      <span class={styles.envLabel} classList={{ [styles.labelSelected]: isSelected() }}>
        Environment
      </span>
    </div>
  );
};
