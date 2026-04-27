import { createSignal, type Accessor } from 'solid-js';
import type { Object3D } from 'three';
import type { Editor } from '../core/Editor';
import type { InteractionMode, TransformMode } from '../core/EventEmitter';
import type { SceneNode } from '../core/scene/SceneFormat';
import type { PrefabAsset } from '../core/scene/PrefabFormat';
import type { EnvironmentSettings } from '../core/scene/EnvironmentSettings';
import * as GlbStore from '../core/scene/GlbStore';
import type { ProjectFile } from '../core/project/ProjectFile';

export const CONFIRM_LOAD_KEY = 'erythos-settings-confirmLoad';
const [confirmBeforeLoad, _setConfirmBeforeLoad] = createSignal<boolean>(
  localStorage.getItem(CONFIRM_LOAD_KEY) !== 'false',
);

export function setConfirmBeforeLoad(value: boolean): void {
  localStorage.setItem(CONFIRM_LOAD_KEY, String(value));
  _setConfirmBeforeLoad(value);
}

export interface EditorBridge {
  editor: Editor;
  selectedUUIDs: Accessor<string[]>;
  hoveredUUID: Accessor<string | null>;
  nodes: Accessor<SceneNode[]>;
  getNode: (uuid: string) => SceneNode | null;
  interactionMode: Accessor<InteractionMode>;
  transformMode: Accessor<TransformMode>;
  sceneVersion: Accessor<number>;
  objectVersion: Accessor<number>;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  autosaveStatus: Accessor<'idle' | 'pending' | 'saved' | 'error'>;
  confirmBeforeLoad: Accessor<boolean>;
  hasClipboard: Accessor<boolean>;
  prefabAssets: Accessor<PrefabAsset[]>;
  environmentSettings: Accessor<EnvironmentSettings>;
  glbKeys: Accessor<string[]>;
  projectOpen: Accessor<boolean>;
  projectName: Accessor<string | null>;
  projectFiles: Accessor<ProjectFile[]>;
  activeViewportId: Accessor<string | null>;
  setActiveViewportId: (id: string | null) => void;
  draggingViewportId: Accessor<string | null>;
  setDraggingViewportId: (id: string | null) => void;
  dragTickVersion: Accessor<number>;
  bumpDragTick: () => void;
  /** Shared grid/axes Object3D refs from App layer — pass to Viewport.mount() for addIgnore */
  sharedGridObjects: Object3D[];
  dispose: () => void;
}

export function createEditorBridge(editor: Editor, sharedGridObjects: Object3D[] = []): EditorBridge {
  const [selectedUUIDs, setSelectedUUIDs] = createSignal<string[]>([]);
  const [hoveredUUID, setHoveredUUID] = createSignal<string | null>(null);
  const [nodes, setNodes] = createSignal<SceneNode[]>([]);
  const [interactionMode, setMode] = createSignal<InteractionMode>('object');
  const [transformMode, setTransformMode] = createSignal<TransformMode>('translate');
  const [sceneVersion, setSceneVersion] = createSignal(0);
  const [objectVersion, setObjectVersion] = createSignal(0);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [autosaveStatus, setAutosaveStatus] = createSignal<'idle' | 'pending' | 'saved' | 'error'>('idle');
  const [hasClipboard, setHasClipboard] = createSignal(false);
  const [prefabAssets, setPrefabAssets] = createSignal<PrefabAsset[]>(editor.getAllPrefabAssets());
  const [glbKeys, setGlbKeys] = createSignal<string[]>([]);
  const [projectOpen, setProjectOpen] = createSignal(editor.projectManager.isOpen);
  const [projectName, setProjectName] = createSignal<string | null>(editor.projectManager.name);
  const [projectFiles, setProjectFiles] = createSignal<ProjectFile[]>(editor.projectManager.getFiles());
  const [activeViewportId, setActiveViewportId] = createSignal<string | null>(null);
  const [draggingViewportId, _setDraggingViewportId] = createSignal<string | null>(null);
  const [dragTickVersion, _bumpDragTick] = createSignal(0);

  // 非同步初始化（fire-and-forget）
  void GlbStore.keys().then(setGlbKeys);

  const bump = (setter: (fn: (v: number) => number) => void) =>
    setter((v) => v + 1);

  // Editor UI-state event handlers
  const editorHandlers = {
    selectionChanged: (uuids: string[]) => setSelectedUUIDs(uuids),
    hoverChanged: (uuid: string | null) => setHoveredUUID(uuid),
    interactionModeChanged: (mode: InteractionMode) => setMode(mode),
    transformModeChanged: (mode: TransformMode) => setTransformMode(mode),
    historyChanged: () => {
      setCanUndo(editor.history.canUndo);
      setCanRedo(editor.history.canRedo);
    },
    autosaveStatusChanged: (status: 'idle' | 'pending' | 'saved' | 'error') => setAutosaveStatus(status),
  } as const;

  // SceneDocument event handlers — Commands operate on SceneDocument directly,
  // so only these events capture all scene changes (not editor.events).
  const onNodeAdded = (_node: SceneNode) => {
    setNodes(editor.sceneDocument.getAllNodes());
    void GlbStore.keys().then(setGlbKeys);
  };
  const onNodeRemoved = (_node: SceneNode) => setNodes(editor.sceneDocument.getAllNodes());
  const onNodeChanged = (_uuid: string, _changed: Partial<SceneNode>) => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setObjectVersion);
  };
  const onSceneReplaced = () => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setSceneVersion);
    void GlbStore.keys().then(setGlbKeys);
  };

  // Subscribe to editor events
  for (const [event, handler] of Object.entries(editorHandlers)) {
    editor.events.on(event as any, handler as any);
  }

  // Subscribe to SceneDocument events
  editor.sceneDocument.events.on('nodeAdded', onNodeAdded);
  editor.sceneDocument.events.on('nodeRemoved', onNodeRemoved);
  editor.sceneDocument.events.on('nodeChanged', onNodeChanged);
  editor.sceneDocument.events.on('sceneReplaced', onSceneReplaced);

  // Subscribe to Clipboard events
  const onClipboardChanged = () => setHasClipboard(editor.clipboard.hasContent);
  editor.clipboard.on('clipboardChanged', onClipboardChanged);

  // Subscribe to PrefabStore events
  const onPrefabStoreChanged = () => setPrefabAssets(editor.getAllPrefabAssets());
  editor.events.on('prefabStoreChanged', onPrefabStoreChanged);

  // Subscribe to EnvironmentSettings events
  const [environmentSettings, setEnvironmentSettings] = createSignal<EnvironmentSettings>(
    editor.getEnvironmentSettings()
  );
  const onEnvChanged = () => setEnvironmentSettings(editor.getEnvironmentSettings());
  editor.events.on('environmentChanged', onEnvChanged);

  // Subscribe to ProjectManager events
  const onProjectChanged = () => {
    setProjectOpen(editor.projectManager.isOpen);
    setProjectName(editor.projectManager.name);
    setProjectFiles(editor.projectManager.getFiles());
  };
  const unsubProject = editor.projectManager.onChange(onProjectChanged);

  const dispose = () => {
    for (const [event, handler] of Object.entries(editorHandlers)) {
      editor.events.off(event as any, handler as any);
    }
    editor.sceneDocument.events.off('nodeAdded', onNodeAdded);
    editor.sceneDocument.events.off('nodeRemoved', onNodeRemoved);
    editor.sceneDocument.events.off('nodeChanged', onNodeChanged);
    editor.sceneDocument.events.off('sceneReplaced', onSceneReplaced);
    editor.clipboard.off('clipboardChanged', onClipboardChanged);
    editor.events.off('prefabStoreChanged', onPrefabStoreChanged);
    editor.events.off('environmentChanged', onEnvChanged);
    unsubProject();
  };

  return {
    editor,
    selectedUUIDs,
    hoveredUUID,
    nodes,
    getNode: (uuid) => editor.sceneDocument.getNode(uuid),
    interactionMode,
    transformMode,
    sceneVersion,
    objectVersion,
    canUndo,
    canRedo,
    autosaveStatus,
    confirmBeforeLoad,
    hasClipboard,
    prefabAssets,
    environmentSettings,
    glbKeys,
    projectOpen,
    projectName,
    projectFiles,
    activeViewportId,
    setActiveViewportId,
    draggingViewportId,
    setDraggingViewportId: _setDraggingViewportId,
    dragTickVersion,
    bumpDragTick: () => _bumpDragTick(v => v + 1),
    sharedGridObjects,
    dispose,
  };
}
