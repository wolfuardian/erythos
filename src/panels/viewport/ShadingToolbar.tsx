import { For, type Component } from 'solid-js';
import type { ShadingMode } from '../../viewport/ShadingManager';
import styles from './ShadingToolbar.module.css';

interface ShadingToolbarProps {
  renderMode: () => ShadingMode;
  setRenderMode: (mode: ShadingMode) => void;
}

export const ShadingToolbar: Component<ShadingToolbarProps> = (props) => {
  return (
    <div class={styles.toolbar}>
      <For each={(['wireframe', 'solid', 'shading', 'rendering'] as ShadingMode[])}>
        {(mode) => (
          <button
            onClick={() => props.setRenderMode(mode)}
            class={styles.modeBtn}
            classList={{ [styles.active]: props.renderMode() === mode }}
          >
            {mode === 'wireframe' ? 'Wire' :
             mode === 'solid' ? 'Solid' :
             mode === 'shading' ? 'Shading' : 'Render'}
          </button>
        )}
      </For>
    </div>
  );
};
