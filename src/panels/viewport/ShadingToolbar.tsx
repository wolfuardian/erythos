import { For, type Component } from 'solid-js';
import type { ShadingMode } from '../../viewport/ShadingManager';

interface ShadingToolbarProps {
  renderMode: () => ShadingMode;
  setRenderMode: (mode: ShadingMode) => void;
  hoveredShading: () => ShadingMode | null;
  setHoveredShading: (mode: ShadingMode | null) => void;
}

export const ShadingToolbar: Component<ShadingToolbarProps> = (props) => {
  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      gap: '2px',
      'user-select': 'none',
    }}>
      <For each={(['wireframe', 'solid', 'shading', 'rendering'] as ShadingMode[])}>
        {(mode) => (
          <button
            onClick={() => props.setRenderMode(mode)}
            onMouseEnter={() => props.setHoveredShading(mode)}
            onMouseLeave={() => props.setHoveredShading(null)}
            style={{
              background: props.renderMode() === mode
                ? 'var(--bg-active)'
                : props.hoveredShading() === mode
                  ? 'var(--bg-hover)'
                  : 'transparent',
              border: 'none',
              color: props.renderMode() === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
              padding: '2px 6px',
              cursor: 'pointer',
              'border-radius': '3px',
              'font-size': '10px',
              'font-weight': props.renderMode() === mode ? '600' : '400',
              height: '18px',
              transition: 'background 0.1s',
            }}
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
