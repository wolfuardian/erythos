import { createSignal, For, Show, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ErrorDialog } from '../../../components/ErrorDialog';

const ProjectPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [pendingName, setPendingName] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [errorTitle, setErrorTitle] = createSignal('');

  const performLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.scene,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = await file.text();
        const parsed = JSON.parse(data);
        editor.loadScene(parsed);
      } catch (e) {
        setErrorTitle('Load Failed');
        setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    };
    input.click();
  };

  const handleDblClick = (name: string) => {
    if (bridge.confirmBeforeLoad()) {
      setPendingName(name);
      setConfirmOpen(true);
    } else {
      performLoad();
    }
  };

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
        Models ({bridge.glbKeys().length})
      </div>

      {/* GLB list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <Show
          when={bridge.glbKeys().length > 0}
          fallback={
            <div style={{
              padding: '16px 12px',
              color: 'var(--text-muted)',
              'font-size': 'var(--font-size-xs)',
              'text-align': 'center',
              'line-height': '1.6',
            }}>
              No models imported.<br />
              Drag a .glb file into the<br />
              viewport or scene tree.
            </div>
          }
        >
          <For each={bridge.glbKeys()}>
            {(filename) => (
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer!.setData('application/erythos-glb', filename);
                  e.dataTransfer!.effectAllowed = 'copy';
                }}
                onDblClick={() => handleDblClick(filename)}
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  cursor: 'grab',
                }}
              >
                {/* GLB badge */}
                <span style={{
                  width: '16px',
                  height: '16px',
                  'border-radius': 'var(--radius-sm)',
                  background: 'var(--badge-mesh, #4a6fa5)',
                  color: 'var(--text-inverse)',
                  'font-size': '9px',
                  'font-weight': 'bold',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'flex-shrink': 0,
                }}>
                  G
                </span>
                <span style={{
                  'font-size': 'var(--font-size-sm)',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                  flex: 1,
                }}>
                  {filename}
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>

      <ConfirmDialog
        open={confirmOpen()}
        title="Load Scene"
        message={`Load "${pendingName()}"? This will replace the current scene.`}
        onConfirm={() => { setConfirmOpen(false); performLoad(); }}
        onCancel={() => setConfirmOpen(false)}
      />
      <ErrorDialog
        open={!!errorMsg()}
        title={errorTitle()}
        message={errorMsg()}
        onClose={() => setErrorMsg('')}
      />
    </div>
  );
};

export default ProjectPanel;
