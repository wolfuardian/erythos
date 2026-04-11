import { type Component, onMount, onCleanup } from 'solid-js';
import { Editor } from '../core/Editor';
import { RemoveObjectCommand } from '../core/commands/RemoveObjectCommand';
import { createEditorBridge } from './bridge';
import { EditorProvider } from './EditorContext';
import DockLayout from './layout/DockLayout';
import { clearSavedLayout } from './layout/defaultLayout';
import type { PanelComponent } from './layout/solid-dockview';
import { ViewportPanel } from '../panels/viewport';
import { SceneTreePanel } from '../panels/scene-tree';
import { PropertiesPanel } from '../panels/properties';
import Toolbar from '../components/Toolbar';

const COMPONENTS: Record<string, PanelComponent> = {
  'viewport': () => <ViewportPanel />,
  'scene-tree': () => <SceneTreePanel />,
  'properties': () => <PropertiesPanel />,
};

const App: Component = () => {
  const editor = new Editor();
  const bridge = createEditorBridge(editor);

  onMount(() => {
    // Register keybindings
    editor.keybindings.registerMany([
      { key: 'z', ctrl: true, action: () => editor.undo(), description: 'Undo' },
      { key: 'y', ctrl: true, action: () => editor.redo(), description: 'Redo' },
      { key: 'z', ctrl: true, shift: true, action: () => editor.redo(), description: 'Redo (alt)' },
      { key: 'Delete', action: () => {
        const obj = editor.selection.selected;
        if (obj) editor.execute(new RemoveObjectCommand(editor, obj));
      }, description: 'Delete selected' },
      { key: 'w', action: () => editor.setTransformMode('translate'), description: 'Translate mode' },
      { key: 'e', action: () => editor.setTransformMode('rotate'), description: 'Rotate mode' },
      { key: 'r', action: () => editor.setTransformMode('scale'), description: 'Scale mode' },
    ]);
    editor.keybindings.attach();
  });

  onCleanup(() => {
    bridge.dispose();
    editor.dispose();
  });

  return (
    <EditorProvider bridge={bridge}>
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        'flex-direction': 'column',
        background: 'var(--bg-app)',
      }}>
        <Toolbar />

        {/* Dock panels */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <DockLayout components={COMPONENTS} />
        </div>

        {/* Status bar */}
        <div style={{
          height: 'var(--statusbar-height)',
          background: 'var(--bg-header)',
          'border-top': '1px solid var(--border-subtle)',
          display: 'flex',
          'align-items': 'center',
          padding: '0 var(--space-md)',
        }}>
          <span style={{ color: 'var(--text-muted)', 'font-size': 'var(--font-size-sm)' }}>
            Ready
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { clearSavedLayout(); location.reload(); }}
            title="清除已儲存的佈局，重新載入為預設配置"
            style={{
              padding: '1px 8px',
              height: '20px',
              background: 'var(--bg-section)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              'border-radius': 'var(--radius-sm)',
              'font-size': 'var(--font-size-xs)',
              cursor: 'pointer',
            }}
          >
            重設佈局
          </button>
        </div>
      </div>
    </EditorProvider>
  );
};

export default App;
