import { type Component, createSignal, onCleanup, Show } from 'solid-js';
import { Editor } from '../core/Editor';
import { ProjectManager } from '../core/project/ProjectManager';
import { RemoveNodeCommand } from '../core/commands/RemoveNodeCommand';
import { createEditorBridge, type EditorBridge } from './bridge';
import { EditorProvider } from './EditorContext';
import { AreaTreeRenderer } from './layout/AreaTreeRenderer';
import { Toolbar } from '../components/Toolbar';
import { WorkspaceTabBar } from './layout/WorkspaceTabBar';
import { GridHelpers } from '../viewport/GridHelpers';
import { Welcome } from './Welcome';

const App: Component = () => {
  // Singleton ProjectManager — 跨 open/close 存活
  const projectManager = new ProjectManager();

  const [editor, setEditor] = createSignal<Editor | null>(null);
  const [bridge, setBridge] = createSignal<EditorBridge | null>(null);
  const [projectOpen, setProjectOpen] = createSignal(false);
  let sharedGrid: GridHelpers | null = null;

  // 地雷 2：保存 listener ref 以便 closeProject 時 off
  let onSceneReplaced: (() => void) | null = null;

  const openProject = async (handle: FileSystemDirectoryHandle) => {
    const e = new Editor(projectManager);
    await e.init();
    await projectManager.openHandle(handle);

    try {
      const sceneFile = await projectManager.readFile('scenes/scene.erythos');
      const text = await sceneFile.text();
      e.loadScene(JSON.parse(text));
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        console.warn('[App] Could not load scene.erythos:', err);
      }
    }

    sharedGrid = new GridHelpers();
    e.threeScene.add(sharedGrid.grid);
    e.threeScene.add(sharedGrid.axes);
    const sharedGridObjects = [sharedGrid.grid, sharedGrid.axes];

    onSceneReplaced = () => {
      if (!sharedGrid) return;
      e.threeScene.add(sharedGrid.grid);
      e.threeScene.add(sharedGrid.axes);
    };
    e.sceneDocument.events.on('sceneReplaced', onSceneReplaced);

    const b = createEditorBridge(e, sharedGridObjects, { closeProject, projectManager });

    e.keybindings.registerMany([
      { key: 'z', ctrl: true, action: () => e.undo(), description: 'Undo' },
      { key: 'y', ctrl: true, action: () => e.redo(), description: 'Redo' },
      { key: 'z', ctrl: true, shift: true, action: () => e.redo(), description: 'Redo (alt)' },
      { key: 'Delete', action: () => {
        const uuid = e.selection.primary;
        if (uuid) e.execute(new RemoveNodeCommand(e, uuid));
      }, description: 'Delete selected' },
      { key: 'w', action: () => e.setTransformMode('translate'), description: 'Translate mode' },
      { key: 'e', action: () => e.setTransformMode('rotate'), description: 'Rotate mode' },
      { key: 'r', action: () => e.setTransformMode('scale'), description: 'Scale mode' },
    ]);
    e.keybindings.attach();

    setEditor(e);
    setBridge(b);
    setProjectOpen(true);
  };

  const closeProject = async () => {
    const e = editor();
    const b = bridge();
    if (!e || !b) return;
    setProjectOpen(false);

    // flush pending autosave before teardown
    await e.autosave?.flushNow();

    // 地雷 2：確實 off sceneReplaced
    if (onSceneReplaced) {
      e.sceneDocument.events.off('sceneReplaced', onSceneReplaced);
      onSceneReplaced = null;
    }

    b.dispose();
    sharedGrid?.dispose();
    sharedGrid = null;
    e.dispose();
    projectManager.close();
    setBridge(null);
    setEditor(null);
  };

  onCleanup(() => { void closeProject(); });

  return (
    <Show when={projectOpen() && editor() && bridge()} fallback={
      <Welcome projectManager={projectManager} onOpenProject={openProject} />
    }>
      <EditorProvider bridge={bridge()!}>
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', 'flex-direction': 'column',
          background: 'var(--bg-app)',
        }}>
          <Toolbar />
          <WorkspaceTabBar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <AreaTreeRenderer />
          </div>
          <StatusBar bridge={bridge()!} />
        </div>
      </EditorProvider>
    </Show>
  );
};

// StatusBar — inline component showing autosave status
const StatusBar: Component<{ bridge: EditorBridge }> = (props) => {
  return (
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
      <Show when={props.bridge.autosaveStatus() !== 'idle'}>
        <span style={{
          color: props.bridge.autosaveStatus() === 'pending'
            ? 'var(--text-muted)'
            : props.bridge.autosaveStatus() === 'error'
              ? 'var(--accent-red)'
              : 'var(--accent-green)',
          'font-size': 'var(--font-size-sm)',
          'margin-right': props.bridge.autosaveStatus() === 'error' ? 'var(--space-sm)' : 'var(--space-md)',
        }}>
          {props.bridge.autosaveStatus() === 'pending'
            ? 'Saving...'
            : props.bridge.autosaveStatus() === 'error'
              ? 'Save failed'
              : 'Saved'}
        </span>
        <Show when={props.bridge.autosaveStatus() === 'error'}>
          <button
            onClick={() => void props.bridge.editor.autosave.flushNow()}
            style={{
              'font-size': 'var(--font-size-sm)',
              color: 'var(--text-default)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              'border-radius': '3px',
              padding: '1px 6px',
              cursor: 'pointer',
              'margin-right': 'var(--space-md)',
            }}
          >
            Retry
          </button>
        </Show>
      </Show>
    </div>
  );
};

export default App;
