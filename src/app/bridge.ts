import { createSignal, type Accessor } from 'solid-js';
import type { Object3D } from 'three';
import type { Editor } from '../core/Editor';
import type { InteractionMode, TransformMode } from '../core/EventEmitter';
import type { SceneNode } from '../core/scene/SceneFormat';
import type { SceneEnv as EnvironmentSettings } from '../core/scene/SceneFormat';
import type { ProjectFile } from '../core/project/ProjectFile';
import type { ProjectManager } from '../core/project/ProjectManager';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';
import type { AssetPath, NodeUUID } from '../utils/branded';
import type { SceneId } from '../core/sync/SyncEngine';
import type { SceneDocument } from '../core/scene/SceneDocument';
import type { User } from '../core/auth/AuthClient';

export const CONFIRM_LOAD_KEY = 'erythos-settings-confirmLoad';
const [confirmBeforeLoad, _setConfirmBeforeLoad] = createSignal<boolean>(
  localStorage.getItem(CONFIRM_LOAD_KEY) !== 'false',
);

export function setConfirmBeforeLoad(value: boolean): void {
  localStorage.setItem(CONFIRM_LOAD_KEY, String(value));
  _setConfirmBeforeLoad(value);
}

export interface SyncConflictPayload {
  sceneId: SceneId;
  scenePath: AssetPath;
  baseVersion: number;
  currentVersion: number;
  /** Local SceneDocument snapshot at the moment of conflict (snapshot, not live reference) */
  localBody: SceneDocument;
  /** Cloud SceneDocument returned by the server's 409 response */
  cloudBody: SceneDocument;
}

export interface EditorBridge {
  editor: Editor;
  selectedUUIDs: Accessor<NodeUUID[]>;
  hoveredUUID: Accessor<NodeUUID | null>;
  nodes: Accessor<SceneNode[]>;
  getNode: (uuid: NodeUUID) => SceneNode | null;
  interactionMode: Accessor<InteractionMode>;
  transformMode: Accessor<TransformMode>;
  sceneVersion: Accessor<number>;
  objectVersion: Accessor<number>;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  autosaveStatus: Accessor<'idle' | 'pending' | 'saved' | 'error'>;
  autosaveFlush: () => Promise<void>;
  confirmBeforeLoad: Accessor<boolean>;
  hasClipboard: Accessor<boolean>;
  environmentSettings: Accessor<EnvironmentSettings>;
  /** Set of node UUIDs with broken asset references (updated on scene reload). */
  brokenRefIds: Accessor<ReadonlySet<string>>;
  isEnvSelected: Accessor<boolean>;
  projectOpen: Accessor<boolean>;
  projectName: Accessor<string | null>;
  projectFiles: Accessor<ProjectFile[]>;
  activeViewportId: Accessor<string | null>;
  setActiveViewportId: (id: string | null) => void;
  draggingViewportId: Accessor<string | null>;
  setDraggingViewportId: (id: string | null) => void;
  dragTickVersion: Accessor<number>;
  bumpDragTick: () => void;
  /** Callback injected by App.tsx to close the current project and return to Welcome */
  closeProject: () => void;
  /** Recent projects list, refreshed on projectManager.onChange() */
  recentProjects: Accessor<ProjectEntry[]>;
  /** ID of the currently open project (null if none) */
  currentProjectId: Accessor<string | null>;
  /** Callback injected by App.tsx to switch to a different recent project by id */
  openProjectById: (id: string) => Promise<void>;
  /** Shared grid/axes Object3D refs from App layer — pass to Viewport.mount() for addIgnore */
  sharedGridObjects: Object3D[];
  /** Reactive accessor for the currently active scene path */
  currentScenePath: Accessor<AssetPath>;
  /** Update the active scene path (kept in sync with autosave) */
  setCurrentScenePath: (path: AssetPath) => void;
  /** Create a new empty scene file; throws if name already exists */
  createScene: (name: string) => Promise<AssetPath>;
  /** Current sync conflict payload — null when no conflict is pending */
  syncConflict: Accessor<SyncConflictPayload | null>;
  /** Resolve the pending sync conflict by choosing which version to keep */
  resolveSyncConflict: (choice: 'keep-local' | 'use-cloud') => Promise<void>;
  /** Scene ID currently tracked in the SyncEngine; null until first loadScene completes. */
  currentSceneId: Accessor<SceneId | null>;
  /**
   * Currently authenticated user.
   * undefined = unresolved (getCurrentUser() still in flight → render skeleton)
   * null      = resolved, anonymous / guest
   * User      = resolved, signed in
   */
  currentUser: Accessor<User | null | undefined>;
  /** Sign the current user out; clears currentUser signal on success. */
  signOut: () => Promise<void>;
  /** Returns the URL that starts the OAuth flow for the given provider. */
  getOAuthStartUrl: (provider: 'github') => string;
  /** Returns the URL for downloading the current user's data export. */
  getExportUrl: () => string;
  /** Permanently deletes the current user's account (GDPR). */
  deleteAccount: () => Promise<void>;
  dispose: () => void;
}

export interface EditorBridgeDeps {
  closeProject: () => void;
  projectManager: ProjectManager;
  openProjectById: (id: string) => Promise<void>;
  autosaveFlush: () => Promise<void>;
  resolveSyncConflict: (choice: 'keep-local' | 'use-cloud') => Promise<void>;
  /** Auth: current user signal accessor — undefined until resolved */
  currentUser?: Accessor<User | null | undefined>;
  /** Auth: setter to clear the currentUser signal after signOut */
  setCurrentUser?: (user: User | null | undefined) => void;
  /** Auth: signOut method (from AuthClient instance) */
  authSignOut?: () => Promise<void>;
  /** Auth: getOAuthStartUrl method (from AuthClient instance) */
  authGetOAuthStartUrl?: (provider: 'github') => string;
  /** Auth: getExportUrl method (from AuthClient instance) */
  authGetExportUrl?: () => string;
  /** Auth: deleteAccount method (from AuthClient instance) */
  authDeleteAccount?: () => Promise<void>;
}

export function createEditorBridge(
  editor: Editor,
  sharedGridObjects: Object3D[] = [],
  deps?: EditorBridgeDeps,
): EditorBridge {
  const [selectedUUIDs, setSelectedUUIDs] = createSignal<NodeUUID[]>([]);
  const [hoveredUUID, setHoveredUUID] = createSignal<NodeUUID | null>(null);
  const [nodes, setNodes] = createSignal<SceneNode[]>(editor.sceneDocument.getAllNodes());
  const [interactionMode, setMode] = createSignal<InteractionMode>('object');
  const [transformMode, setTransformMode] = createSignal<TransformMode>('translate');
  const [sceneVersion, setSceneVersion] = createSignal(0);
  const [objectVersion, setObjectVersion] = createSignal(0);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [autosaveStatus, setAutosaveStatus] = createSignal<'idle' | 'pending' | 'saved' | 'error'>('idle');
  const [hasClipboard, setHasClipboard] = createSignal(false);
  const [projectOpen, setProjectOpen] = createSignal(editor.projectManager.isOpen);
  const [projectName, setProjectName] = createSignal<string | null>(editor.projectManager.name);
  const [projectFiles, setProjectFiles] = createSignal<ProjectFile[]>(editor.projectManager.getFiles());
  const [activeViewportId, setActiveViewportId] = createSignal<string | null>(null);
  const [draggingViewportId, _setDraggingViewportId] = createSignal<string | null>(null);
  const [dragTickVersion, _bumpDragTick] = createSignal(0);
  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [currentProjectId, setCurrentProjectId] = createSignal<string | null>(
    editor.projectManager.currentId,
  );
  const [syncConflict, setSyncConflict] = createSignal<SyncConflictPayload | null>(null);
  const [currentSceneId, setCurrentSceneId] = createSignal<SceneId | null>(null);

  // Auth state — may be injected by App.tsx (which owns the single AuthClient instance)
  // If not injected (e.g. in tests), falls back to a local signal that stays undefined.
  const [_localCurrentUser, _setLocalCurrentUser] = createSignal<User | null | undefined>(undefined);
  const currentUser: Accessor<User | null | undefined> = deps?.currentUser ?? _localCurrentUser;
  const _setCurrentUser = deps?.setCurrentUser ?? _setLocalCurrentUser;

  // 非同步初始化（fire-and-forget）
  void editor.projectManager.getRecentProjects().then(setRecentProjects);

  const bump = (setter: (fn: (v: number) => number) => void) =>
    setter((v) => v + 1);

  // Editor UI-state event handlers
  const editorHandlers = {
    selectionChanged: (uuids: NodeUUID[]) => setSelectedUUIDs(uuids),
    hoverChanged: (uuid: NodeUUID | null) => setHoveredUUID(uuid),
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
  };
  const onNodeRemoved = (_node: SceneNode) => setNodes(editor.sceneDocument.getAllNodes());
  const onNodeChanged = (_uuid: string, _changed: Partial<SceneNode>) => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setObjectVersion);
  };
  const onSceneReplaced = () => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setSceneVersion);
    setBrokenRefIds(new Set(editor.sceneSync.getBrokenRefIds()));
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

  // Subscribe to EnvironmentSettings events
  const [environmentSettings, setEnvironmentSettings] = createSignal<EnvironmentSettings>(
    editor.getEnvironmentSettings()
  );

  // Broken-ref IDs signal -- updated whenever scene is replaced or nodes change
  const [brokenRefIds, setBrokenRefIds] = createSignal<ReadonlySet<string>>(
    new Set(editor.sceneSync.getBrokenRefIds())
  );
  const onEnvChanged = () => setEnvironmentSettings(editor.getEnvironmentSettings());
  editor.events.on('environmentChanged', onEnvChanged);
  // Subscribe to brokenRefsChanged (fired by Editor.loadScene after full hydration)
  const onBrokenRefsChanged = () => setBrokenRefIds(new Set(editor.sceneSync.getBrokenRefIds()));
  editor.events.on('brokenRefsChanged', onBrokenRefsChanged);

  // Subscribe to env selection events
  const [isEnvSelected, setIsEnvSelected] = createSignal<boolean>(false);
  const onEnvSelectionChanged = (selected: boolean) => setIsEnvSelected(selected);
  editor.events.on('envSelectionChanged', onEnvSelectionChanged);

  // Subscribe to sync conflict events
  const onSyncConflict = (payload: SyncConflictPayload) => setSyncConflict(payload);
  editor.events.on('syncConflict', onSyncConflict);

  // Subscribe to sync scene ID changes (fired by Editor.loadScene after create)
  const onSyncSceneIdChanged = (id: SceneId | null) => setCurrentSceneId(id);
  editor.events.on('syncSceneIdChanged', onSyncSceneIdChanged);

  // Subscribe to ProjectManager events
  const onProjectChanged = () => {
    setProjectOpen(editor.projectManager.isOpen);
    setProjectName(editor.projectManager.name);
    setProjectFiles(editor.projectManager.getFiles());
    setCurrentProjectId(editor.projectManager.currentId);
    void editor.projectManager.getRecentProjects().then(setRecentProjects);
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
    editor.events.off('environmentChanged', onEnvChanged);
    editor.events.off('brokenRefsChanged', onBrokenRefsChanged);
    editor.events.off('envSelectionChanged', onEnvSelectionChanged);
    editor.events.off('syncConflict', onSyncConflict);
    editor.events.off('syncSceneIdChanged', onSyncSceneIdChanged);
    // Lock 6: clear syncConflict signal on dispose
    setSyncConflict(null);
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
    autosaveFlush: deps?.autosaveFlush ?? (() => Promise.resolve()),
    confirmBeforeLoad,
    hasClipboard,
    environmentSettings,
    brokenRefIds,
    isEnvSelected,
    projectOpen,
    projectName,
    projectFiles,
    activeViewportId,
    setActiveViewportId,
    draggingViewportId,
    setDraggingViewportId: _setDraggingViewportId,
    dragTickVersion,
    bumpDragTick: () => _bumpDragTick(v => v + 1),
    closeProject: deps?.closeProject ?? (() => {}),
    recentProjects,
    currentProjectId,
    openProjectById: deps?.openProjectById ?? ((_id: string) => Promise.resolve()),
    sharedGridObjects,
    currentScenePath: editor.projectManager.currentScenePath,
    setCurrentScenePath: (path: AssetPath) => editor.projectManager.setCurrentScenePath(path),
    createScene: (name: string) => editor.projectManager.createScene(name),
    syncConflict,
    resolveSyncConflict: deps?.resolveSyncConflict ?? ((_choice: 'keep-local' | 'use-cloud') => Promise.resolve()),
    currentSceneId,
    currentUser,
    signOut: async () => {
      await (deps?.authSignOut ?? (() => Promise.resolve()))();
      _setCurrentUser(null);
    },
    getOAuthStartUrl: deps?.authGetOAuthStartUrl ?? ((_provider: 'github') => ''),
    getExportUrl: deps?.authGetExportUrl ?? (() => ''),
    deleteAccount: deps?.authDeleteAccount ?? (() => Promise.resolve()),
    dispose,
  };
}
