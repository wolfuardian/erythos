import { type Component, onMount, onCleanup, Show } from 'solid-js';
import { Editor } from '../core/Editor';
import { RemoveObjectCommand } from '../core/commands/RemoveObjectCommand';
import { createEditorBridge } from './bridge';
import { EditorProvider } from './EditorContext';
import DockLayout from './layout/DockLayout';
import type { PanelComponent } from './layout/solid-dockview';
import { ViewportPanel } from '../panels/viewport';
import { SceneTreePanel } from '../panels/scene-tree';
import { PropertiesPanel } from '../panels/properties';
import ProjectPanel from './panels/project/ProjectPanel';
import SettingsPanel from './panels/settings/SettingsPanel';
import Toolbar from '../components/Toolbar';

const COMPONENTS: Record<string, PanelComponent> = {
  'viewport': () => <ViewportPanel />,
  'scene-tree': () => <SceneTreePanel />,
  'properties': () => <PropertiesPanel />,
  'project': () => <ProjectPanel />,
  'settings': () => <SettingsPanel />,
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
          <Show when={bridge.autosaveStatus() !== 'idle'}>
            <span style={{
              color: bridge.autosaveStatus() === 'pending' ? 'var(--text-muted)' : 'var(--accent-green)',
              'font-size': 'var(--font-size-sm)',
              'margin-right': 'var(--space-md)',
            }}>
              {bridge.autosaveStatus() === 'pending' ? '儲存中…' : '已儲存'}
            </span>
          </Show>
        </div>
      </div>
    </EditorProvider>
  );
};

export default App;
