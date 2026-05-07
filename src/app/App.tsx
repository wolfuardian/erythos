import { type Component, createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { AssetPath } from '../utils/branded';
import { Editor } from '../core/Editor';
import { createAutoSave, type AutoSaveHandle } from '../core/scene/AutoSave';
import { LocalSyncEngine } from '../core/sync/LocalSyncEngine';
import { ProjectManager } from '../core/project/ProjectManager';
import { RemoveNodeCommand } from '../core/commands/RemoveNodeCommand';
import { createEditorBridge, type EditorBridge } from './bridge';
import { EditorProvider } from './EditorContext';
import { editors } from './editors';
import { AreaTreeRenderer } from './layout/AreaTreeRenderer';
import { Toolbar } from '../components/Toolbar';
import { GridHelpers } from '../viewport/GridHelpers';
import { Welcome } from './Welcome';
import {
  DEFAULT_SCENE_PATH,
  getLastProjectId, setLastProjectId, clearLastProjectId,
  getLastScenePath, setLastScenePath, clearLastScenePath,
} from './projectSession';
import styles from './App.module.css';

const App: Component = () => {
  // Singleton ProjectManager — 跨 open/close 存活
  const projectManager = new ProjectManager();
  // Singleton SyncEngine — IndexedDB-backed; persists across page reloads.
  const syncEngine = new LocalSyncEngine();

  const [editor, setEditor] = createSignal<Editor | null>(null);
  const [bridge, setBridge] = createSignal<EditorBridge | null>(null);
  const [projectOpen, setProjectOpen] = createSignal(false);
  let sharedGrid: GridHelpers | null = null;
  let autosaveHandle: AutoSaveHandle | null = null;

  // 地雷 2：保存 listener ref 以便 closeProject 時 off
  let onSceneReplaced: (() => void) | null = null;

  const openProject = async (handle: FileSystemDirectoryHandle) => {
    const e = new Editor(projectManager);
    e.syncEngine = syncEngine;
    // Order matters: openHandle MUST precede init() so that init's IDB→file migration
    // and PrefabRegistry hydration see isOpen=true. Reversing this guard-skips both,
    // resulting in empty prefab list + legacy refs stripped as orphans (data loss).
    await projectManager.openHandle(handle);
    await e.init();
    autosaveHandle = createAutoSave(e);

    // Resolve scene path: persisted per-project value, fall back to default.
    const projectId = projectManager.currentId;
    let scenePath = DEFAULT_SCENE_PATH;
    if (projectId) {
      const persisted = getLastScenePath(projectId);
      if (persisted) scenePath = persisted;
    }
    projectManager.setCurrentScenePath(scenePath);

    const tryLoadScene = async (path: AssetPath): Promise<'ok' | 'notFound' | 'failed'> => {
      try {
        const sceneFile = await projectManager.readFile(path);
        const text = await sceneFile.text();
        await e.loadScene(JSON.parse(text));
        return 'ok';
      } catch (err: any) {
        if (err?.name === 'NotFoundError') return 'notFound';
        console.warn(`[App] Could not load scene "${path}":`, err);
        return 'failed';
      }
    };

    const result = await tryLoadScene(scenePath);
    if (result === 'notFound' && scenePath !== DEFAULT_SCENE_PATH) {
      // Persisted scene was deleted — drop the stale key and retry the default.
      if (projectId) clearLastScenePath(projectId);
      scenePath = DEFAULT_SCENE_PATH;
      projectManager.setCurrentScenePath(scenePath);
      await tryLoadScene(scenePath);
    }
    // For default-path NotFoundError keep default so autosave writes to the correct location.

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

    const b = createEditorBridge(e, sharedGridObjects, {
      closeProject,
      projectManager,
      openProjectById,
      autosaveFlush: () => autosaveHandle?.flushNow() ?? Promise.resolve(),
    });

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

    // Persist for auto-restore on next page reload
    if (projectManager.currentId) setLastProjectId(projectManager.currentId);
  };

  const closeProject = async () => {
    const e = editor();
    const b = bridge();
    if (!e || !b) return;
    setProjectOpen(false);

    // flush pending autosave before teardown
    await autosaveHandle?.flushNow();
    autosaveHandle?.dispose();
    autosaveHandle = null;

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

    // Explicit close → don't auto-restore on next reload
    clearLastProjectId();
  };

  const openProjectById = async (id: string) => {
    const handle = await projectManager.openRecent(id);
    if (!handle) return;
    await closeProject();
    await openProject(handle);
  };

  // Persist active scene path per-project so reload resumes the right scene.
  createEffect(() => {
    const path = projectManager.currentScenePath();
    const id = projectManager.currentId;
    if (id) setLastScenePath(id, path);
  });

  // Auto-restore last opened project on page reload
  onMount(() => {
    const lastId = getLastProjectId();
    if (!lastId) return;
    void (async () => {
      const handle = await projectManager.openRecent(lastId);
      if (!handle) {
        // permission denied or entry gone — clear and stay on Welcome
        clearLastProjectId();
        return;
      }
      await openProject(handle);
    })();
  });

  onCleanup(() => { void closeProject(); });

  return (
    <Show when={projectOpen() && editor() && bridge()} fallback={
      <Welcome projectManager={projectManager} onOpenProject={openProject} />
    }>
      <EditorProvider bridge={bridge()!} editors={editors}>
        <div class={styles.root}>
          <Toolbar />
          <div class={styles.contentArea}>
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
  const status = () => props.bridge.autosaveStatus();
  return (
    <div class={styles.statusBar}>
      <span class={styles.statusReady}>Ready</span>
      <div class={styles.statusSpacer} />
      <Show when={status() !== 'idle'}>
        <span
          class={styles.statusSaveText}
          classList={{
            [styles.pending]: status() === 'pending',
            [styles.saved]: status() === 'saved',
            [styles.error]: status() === 'error',
          }}
        >
          {status() === 'pending'
            ? 'Saving...'
            : status() === 'error'
              ? 'Save failed'
              : 'Saved'}
        </span>
        <Show when={status() === 'error'}>
          <button
            class={styles.retryButton}
            onClick={() => void props.bridge.autosaveFlush()}
          >
            Retry
          </button>
        </Show>
      </Show>
    </div>
  );
};

export default App;
