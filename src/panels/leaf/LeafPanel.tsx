import { createSignal, For, Show, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';

const LeafPanel: Component = () => {
  const bridge = useEditor();
  const [activeId, setActiveId] = createSignal<string | null>(null);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 10px',
        'border-bottom': '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
        'font-size': 'var(--font-size-xs)',
        'text-transform': 'uppercase',
        'letter-spacing': '0.5px',
        'flex-shrink': 0,
      }}>
        Leaves ({bridge.leafAssets().length})
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <Show
          when={bridge.leafAssets().length > 0}
          fallback={
            <div style={{
              padding: '16px 12px',
              color: 'var(--text-muted)',
              'font-size': 'var(--font-size-xs)',
              'text-align': 'center',
              'line-height': '1.6',
            }}>
              No leaves saved.<br />
              Right-click a node in Scene tree<br />
              to save as leaf.
            </div>
          }
        >
          <For each={bridge.leafAssets()}>
            {(asset) => {
              const isActive = () => activeId() === asset.id;
              return (
                <div
                  onClick={() => setActiveId(isActive() ? null : asset.id)}
                  style={{
                    display: 'flex',
                    'align-items': 'center',
                    gap: '6px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    background: isActive()
                      ? 'var(--bg-selected, rgba(74,127,191,0.2))'
                      : 'transparent',
                    'border-left': isActive()
                      ? '2px solid var(--accent-primary, #4a7fbf)'
                      : '2px solid transparent',
                  }}
                >
                  {/* Leaf icon badge */}
                  <span style={{
                    width: '16px',
                    height: '16px',
                    'border-radius': 'var(--radius-sm)',
                    background: 'var(--badge-mesh, #4a7f6f)',
                    color: 'var(--text-inverse)',
                    'font-size': '9px',
                    'font-weight': 'bold',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    'flex-shrink': 0,
                  }}>
                    L
                  </span>
                  {/* Name */}
                  <span style={{
                    'font-size': 'var(--font-size-sm)',
                    color: isActive()
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    'white-space': 'nowrap',
                    flex: 1,
                  }}>
                    {asset.name}
                  </span>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default LeafPanel;
