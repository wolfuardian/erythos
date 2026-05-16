import { createSignal, type Accessor } from 'solid-js';
import type { Object3D } from 'three';
import type { Editor } from '../core/Editor';
import type { InteractionMode, TransformMode } from '../core/EventEmitter';
import type { SceneNode } from '../core/scene/SceneFormat';
import type { SceneEnv as EnvironmentSettings } from '../core/scene/SceneFormat';
import type { ProjectFile } from '../core/project/ProjectFile';
import type { LocalProjectManager } from '../core/project/LocalProjectManager';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';
import type { AssetPath, NodeUUID } from '../utils/branded';
import type { SceneId } from '../core/sync/SyncEngine';
import type { SceneDocument } from '../core/scene/SceneDocument';
import type { User } from '../core/auth/AuthClient';
import type { RealtimeClient, ConnectionStatus } from '../core/realtime/RealtimeClient';
import type { RemoteAwarenessEntry } from '../core/realtime/awareness';

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

export type SyncErrorKind = 'payload-too-large' | 'sync-failed-local-saved' | 'client-bug' | 'network-offline';

export interface SyncErrorPayload {
  kind: SyncErrorKind;
  message: string;
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
  /** Current sync error (413/412/500/network) — null when no error is active */
  syncError: Accessor<SyncErrorPayload | null>;
  /** Dismiss the active sync error banner */
  dismissSyncError: () => void;
  /** Scene ID currently tracked in the SyncEngine; null until first loadScene completes. */
  currentSceneId: Accessor<SceneId | null>;
  /**
   * Type of the currently open project manager.
   * 'local' = LocalProjectManager (v0.1 default)
   * 'cloud' = CloudProjectManager (G2+)
   */
  projectType: Accessor<'local' | 'cloud'>;
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
  /**
   * Schedules the current user's account for deletion (30-day grace period, G1 refs #1095).
   * Returns the scheduled deletion timestamp on success.
   */
  deleteAccount: () => Promise<{ scheduledDeleteAt: string }>;
  /**
   * Cancels a pending account deletion during the 30-day grace period (G1 refs #1095).
   */
  cancelDeleteAccount: () => Promise<void>;
  /** Requests a magic-link sign-in email for the given address. */
  requestMagicLink: (email: string) => Promise<void>;
  /** Whether the editor is in read-only mode (viewer mode). Panels should disable all mutation UI when true. */
  editorReadOnly: Accessor<boolean>;
  /**
   * Delete the current cloud project (calls DELETE /api/scenes/:id then closes the project).
   * undefined for local projects.
   */
  deleteCloudProject: (() => void) | undefined;
  /**
   * Upgrade the currently open LocalProject to a CloudProject.
   * Uploads all assets + creates a cloud scene, then switches the editor.
   * undefined for cloud projects (button hidden in that case).
   * Spec ref: docs/cloud-project-spec.md § Local → Cloud 升級 (D-7, refs #1053)
   */
  upgradeLocalToCloud: (() => Promise<void>) | undefined;

  // ─── L3-A3: Realtime presence signals ─────────────────────────────────────
  /**
   * Reactive remote peer awareness states.
   * null = no realtime client mounted (local project / viewer mode).
   */
  remoteStates: Accessor<RemoteAwarenessEntry[] | null>;
  /** Reactive realtime connection status. null when not connected. */
  realtimeStatus: Accessor<ConnectionStatus | null>;
  /**
   * Broadcast local cursor position (normalized 0..1 viewport coords).
   * No-op when realtime is not mounted or editorReadOnly.
   */
  setCursor: (x: number, y: number, viewport: 'main' | 'scene-tree' | null) => void;
  /**
   * Broadcast local selection change.
   * No-op when realtime is not mounted or editorReadOnly.
   */
  setSelection: (nodeIds: string[]) => void;

  dispose: () => void;
}

export interface EditorBridgeDeps {
  closeProject: () => void;
  projectManager: LocalProjectManager;
  /** Cloud project name — overrides editor.projectManager.name (cloud projects don't open a LocalProjectManager). */
  projectName?: string | null;
  /** Cloud project type — overrides editor.projectManager.type (cloud projects don't open a LocalProjectManager). */
  projectType?: 'local' | 'cloud';
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
  /** Auth: deleteAccount method (from AuthClient instance) — G1 grace period (refs #1095) */
  authDeleteAccount?: () => Promise<{ scheduledDeleteAt: string }>;
  /** Auth: cancelDeleteAccount method (from AuthClient instance) — G1 cancel grace (refs #1095) */
  authCancelDeleteAccount?: () => Promise<void>;
  /** Auth: requestMagicLink method (from AuthClient instance) */
  authRequestMagicLink?: (email: string) => Promise<void>;
  /**
   * Delete the current cloud project.
   * App.tsx implements this as a DELETE fetch + closeProject.
   * Only set for cloud projects; undefined for local.
   */
  deleteCloudProject?: () => void;
  /**
   * Upgrade the currently open LocalProject to a CloudProject.
   * Only set for local projects; undefined for cloud.
   * Spec ref: docs/cloud-project-spec.md § Local → Cloud 升級 (refs #1053)
   */
  upgradeLocalToCloud?: () => Promise<void>;

  // ─── L3-A3: Realtime presence injection ───────────────────────────────────
  /**
   * Mounted RealtimeClient instance (cloud project only).
   * When provided, bridge exposes its signals and write API.
   */
  realtimeClient?: RealtimeClient;
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
  const [projectName, setProjectName] = createSignal<string | null>(
    deps?.projectName ?? editor.projectManager.name,
  );
  const [projectFiles, setProjectFiles] = createSignal<ProjectFile[]>(editor.projectManager.getFiles());
  const [activeViewportId, setActiveViewportId] = createSignal<string | null>(null);
  const [draggingViewportId, _setDraggingViewportId] = createSignal<string | null>(null);
  const [dragTickVersion, _bumpDragTick] = createSignal(0);
  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [currentProjectId, setCurrentProjectId] = createSignal<string | null>(
    editor.projectManager.currentId,
  );
  const [syncConflict, setSyncConflict] = createSignal<SyncConflictPayload | null>(null);
  const [syncError, setSyncError] = createSignal<SyncErrorPayload | null>(null);
  const [currentSceneId, setCurrentSceneId] = createSignal<SceneId | null>(null);

  // Auth state — may be injected by App.tsx (which owns the single AuthClient instance)
  // If not injected (e.g. in tests), falls back to a local signal that stays undefined.
  const [_localCurrentUser, _setLocalCurrentUser] = createSignal<User | null | undefined>(undefined);
  const currentUser: Accessor<User | null | undefined> = deps?.currentUser ?? _localCurrentUser;
  const _setCurrentUser = deps?.setCurrentUser ?? _setLocalCurrentUser;

  // L3-A3: Realtime presence — derive signals from injected RealtimeClient (if any)
  const rt = deps?.realtimeClient;
  const remoteStates: Accessor<RemoteAwarenessEntry[] | null> = rt
    ? () => rt.remoteStates()
    : () => null;
  const realtimeStatus: Accessor<ConnectionStatus | null> = rt
    ? () => rt.status()
    : () => null;

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
  const onNodeChanged = (_uuid: NodeUUID, _changed: Partial<SceneNode>) => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setObjectVersion);
  };
  const onSceneReplaced = () => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setSceneVersion);
    setBrokenRefIds(new Set(editor.sceneSync.getBrokenRefIds()));
  };

  // Subscribe to editor events
  editor.events.on('selectionChanged', editorHandlers.selectionChanged);
  editor.events.on('hoverChanged', editorHandlers.hoverChanged);
  editor.events.on('interactionModeChanged', editorHandlers.interactionModeChanged);
  editor.events.on('transformModeChanged', editorHandlers.transformModeChanged);
  editor.events.on('historyChanged', editorHandlers.historyChanged);
  editor.events.on('autosaveStatusChanged', editorHandlers.autosaveStatusChanged);

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

  // Subscribe to sync error events (413/412/500/network)
  const onSyncError = (payload: SyncErrorPayload) => setSyncError(payload);
  editor.events.on('syncError', onSyncError);

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
    editor.events.off('selectionChanged', editorHandlers.selectionChanged);
    editor.events.off('hoverChanged', editorHandlers.hoverChanged);
    editor.events.off('interactionModeChanged', editorHandlers.interactionModeChanged);
    editor.events.off('transformModeChanged', editorHandlers.transformModeChanged);
    editor.events.off('historyChanged', editorHandlers.historyChanged);
    editor.events.off('autosaveStatusChanged', editorHandlers.autosaveStatusChanged);
    editor.sceneDocument.events.off('nodeAdded', onNodeAdded);
    editor.sceneDocument.events.off('nodeRemoved', onNodeRemoved);
    editor.sceneDocument.events.off('nodeChanged', onNodeChanged);
    editor.sceneDocument.events.off('sceneReplaced', onSceneReplaced);
    editor.clipboard.off('clipboardChanged', onClipboardChanged);
    editor.events.off('environmentChanged', onEnvChanged);
    editor.events.off('brokenRefsChanged', onBrokenRefsChanged);
    editor.events.off('envSelectionChanged', onEnvSelectionChanged);
    editor.events.off('syncConflict', onSyncConflict);
    editor.events.off('syncError', onSyncError);
    editor.events.off('syncSceneIdChanged', onSyncSceneIdChanged);
    // Lock 6: clear syncConflict signal on dispose
    setSyncConflict(null);
    setSyncError(null);
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
    // Clear the syncConflict signal after the underlying autosave resolveConflict
    // returns. Without this, the dialog stays mounted after the user clicks
    // Keep local / Use cloud version — the autosave layer drops its internal
    // pendingConflict state but the UI signal never gets notified.
    resolveSyncConflict: async (choice: 'keep-local' | 'use-cloud') => {
      const fn = deps?.resolveSyncConflict;
      if (fn) await fn(choice);
      setSyncConflict(null);
    },
    syncError,
    dismissSyncError: () => setSyncError(null),
    currentSceneId,
    projectType: () => deps?.projectType ?? (editor.projectManager.type as 'local' | 'cloud'),
    currentUser,
    signOut: async () => {
      await (deps?.authSignOut ?? (() => Promise.resolve()))();
      _setCurrentUser(null);
    },
    getOAuthStartUrl: deps?.authGetOAuthStartUrl ?? ((_provider: 'github') => ''),
    getExportUrl: deps?.authGetExportUrl ?? (() => ''),
    deleteAccount: deps?.authDeleteAccount ?? (() => Promise.resolve({ scheduledDeleteAt: '' })),
    cancelDeleteAccount: deps?.authCancelDeleteAccount ?? (() => Promise.resolve()),
    requestMagicLink:
      deps?.authRequestMagicLink ?? ((_email: string) => Promise.resolve()),
    editorReadOnly: editor.readOnly,
    deleteCloudProject: deps?.deleteCloudProject,
    upgradeLocalToCloud: deps?.upgradeLocalToCloud,

    // L3-A3 realtime presence
    remoteStates,
    realtimeStatus,
    setCursor: (x, y, viewport) => {
      if (rt && !editor.readOnly()) rt.setCursor(x, y, viewport);
    },
    setSelection: (nodeIds) => {
      if (rt && !editor.readOnly()) rt.setSelection(nodeIds);
    },

    dispose,
  };
}
