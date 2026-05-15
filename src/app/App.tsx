import { type Component, createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { useOfflineStatus } from '../core/network/useOfflineStatus';
import { OfflineBanner } from '../components/OfflineBanner';
import type { AssetPath } from '../utils/branded';
import { Editor } from '../core/Editor';
import { HttpAssetClient } from '../core/sync/asset/HttpAssetClient';
import { createAutoSave, createCloudAutoSave, type AutoSaveHandle } from '../core/scene/AutoSave';
import { createMultiTabCoord, type MultiTabCoord } from '../core/sync/MultiTabCoord';
import { HttpSyncEngine } from '../core/sync/HttpSyncEngine';
import { defaultBaseUrl } from '../core/sync/baseUrl';
import { AuthClient, AuthError, type User } from '../core/auth/AuthClient';
import { LocalProjectManager } from '../core/project/LocalProjectManager';
import { CloudProjectManager } from '../core/project/CloudProjectManager';
import { AddNodeCommand } from '../core/commands/AddNodeCommand';
import { MultiCmdsCommand } from '../core/commands/MultiCmdsCommand';
import { createEditorBridge, type EditorBridge } from './bridge';
import { registerEditorKeybindings } from './editorKeybindings';
import { makeAuthCallbacks } from './authCallbacks';
import { EditorProvider } from './EditorContext';
import { editors } from './editors';
import { AreaTreeRenderer } from './layout/AreaTreeRenderer';
import { Toolbar } from '../components/Toolbar';
import { GridHelpers } from '../viewport/GridHelpers';
import { Welcome } from './Welcome';
import { SyncConflictDialog } from '../components/SyncConflictDialog';
import { SyncErrorOverlay } from '../components/SyncErrorBanner';
import { CopyAsJsonModal } from '../components/CopyAsJsonModal';
import { PasteFromJsonModal } from '../components/PasteFromJsonModal';
import { ErrorDialog } from '../components/ErrorDialog';
import { UnsupportedVersionError, SceneInvariantError } from '../core/scene/SceneDocument';
import { createEmptyScene } from '../core/scene/io/types';
import { NotFoundError } from '../core/sync/SyncEngine';
import {
  DEFAULT_SCENE_PATH,
  getLastProjectId, setLastProjectId, clearLastProjectId,
  getLastScenePath, setLastScenePath, clearLastScenePath,
} from './projectSession';
import { currentRoute, navigateToScene } from './router';
import { ViewerShell } from './ViewerBanner';
import { AuthErrorOverlay, parseAuthErrorCode, type AuthErrorCode } from './AuthErrorBanner';
import { RealtimeClient } from '../core/realtime/RealtimeClient';
import styles from './App.module.css';
import viewerStyles from './ShareTokenViewer.module.css';

const App: Component = () => {
  // Singleton LocalProjectManager — 跨 open/close 存活
  const projectManager = new LocalProjectManager();
  // Singleton SyncEngine — HTTP-backed; routes to server API.
  // Inject projectManager + HttpAssetClient so push/create upload project:// binaries
  // to S3 and rewrite URLs to assets:// before sending the scene to the server (F-1d-2b).
  // Note: HttpAssetClient instance is separate from the one injected into Editor/AssetResolver
  // (stateless client, fine to have two; follow-up: consider shared instance).
  const syncEngine = new HttpSyncEngine(undefined, projectManager, new HttpAssetClient());
  // Singleton AuthClient — session via HttpOnly cookie; no token storage in JS.
  const authClient = new AuthClient();

  // Offline status — reactive boolean, true when client is offline.
  // Disposed on component cleanup. See src/core/network/useOfflineStatus.ts.
  // G6: used to show OfflineBanner for cloud projects.
  const { isOffline, dispose: disposeOfflineStatus } = useOfflineStatus();
  onCleanup(disposeOfflineStatus);

  // currentUser signal: undefined = unresolved, null = guest, User = signed in
  const [currentUser, setCurrentUser] = createSignal<User | null | undefined>(undefined);

  const [editor, setEditor] = createSignal<Editor | null>(null);
  const [bridge, setBridge] = createSignal<EditorBridge | null>(null);
  const [projectOpen, setProjectOpen] = createSignal(false);
  let sharedGrid: GridHelpers | null = null;
  let autosaveHandle: AutoSaveHandle | null = null;
  // Active CloudProjectManager — set by openCloudProject, null for local projects
  let activeCloudManager: CloudProjectManager | null = null;
  // Cross-tab coordinator for #1006 cloud scene invalidation broadcasts
  let activeCloudTabCoord: MultiTabCoord | null = null;

  // L3-A3: Active RealtimeClient — set when a cloud project is open, null otherwise
  let activeRealtimeClient: RealtimeClient | null = null;

  // Offline cached mode — set when a cloud project loads from IndexedDB cache (offline cold-start).
  // Causes the editor to be read-only + shows the cached-version OfflineBanner variant.
  // spec § Offline 策略: 冷啟動有 cache → viewer mode + "Offline — viewing cached version" banner.
  // TODO follow-up: auto-exit cached mode when user reconnects (requires another loadScene +
  //   state reconciliation — out of scope for this fix).
  const [offlineCachedMode, setOfflineCachedMode] = createSignal(false);

  // Viewer mode state — set when URL is /scenes/{uuid} and scene is not locally owned
  const [viewerSceneId, setViewerSceneId] = createSignal<string | null>(null);
  const [viewerSceneName, setViewerSceneName] = createSignal<string>('Untitled Scene');
  // Share token viewer — set when URL has ?share_token=<token>
  const [viewerShareToken, setViewerShareToken] = createSignal<string | undefined>(undefined);
  const [viewerSharedBy, setViewerSharedBy] = createSignal<string | undefined>(undefined);
  const [viewerTokenInvalid, setViewerTokenInvalid] = createSignal(false);

  // auth_error banner: set from URL query on mount, dismissed by user
  const [authError, setAuthError] = createSignal<AuthErrorCode | null>(null);

  // 地雷 2：保存 listener ref 以便 closeProject 時 off
  let onSceneReplaced: (() => void) | null = null;

  // Copy as JSON modal state
  const [copyAsJsonOpen, setCopyAsJsonOpen] = createSignal(false);
  const [copyAsJsonContent, setCopyAsJsonContent] = createSignal('');

  // Paste from JSON modal state
  const [pasteFromJsonOpen, setPasteFromJsonOpen] = createSignal(false);

  // Paste error dialog state
  const [pasteErrorOpen, setPasteErrorOpen] = createSignal(false);
  const [pasteErrorTitle, setPasteErrorTitle] = createSignal('');
  const [pasteErrorMessage, setPasteErrorMessage] = createSignal('');

  // Cmd+J (Mac) / Ctrl+J (Win/Linux) -- open Copy as JSON modal
  createEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'j') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const el = e.target as HTMLElement;
      if (el.isContentEditable) return;
      const e2 = editor();
      if (!e2) return;
      e.preventDefault();
      setCopyAsJsonContent(JSON.stringify(e2.sceneDocument.serialize(), null, 2));
      setCopyAsJsonOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  // Cmd+Shift+V (Mac) / Ctrl+Shift+V (Win/Linux) -- open Paste from JSON modal
  createEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'v') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const el = e.target as HTMLElement;
      if (el.isContentEditable) return;
      const e2 = editor();
      if (!e2) return;
      e.preventDefault();
      setPasteFromJsonOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  /** Execute the paste-from-JSON import pipeline. Called from PasteFromJsonModal on confirm. */
  const handlePasteImport = (text: string) => {
    const e = editor();
    if (!e) return;

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setPasteFromJsonOpen(false);
      setPasteErrorTitle('Invalid JSON');
      setPasteErrorMessage('The text you pasted is not valid JSON. Please check and try again.');
      setPasteErrorOpen(true);
      return;
    }

    // Determine target parent: current selection or scene root.
    const targetParent = e.selection.primary ?? null;

    let nodes;
    try {
      nodes = e.sceneDocument.parsePastePayload(raw, targetParent);
    } catch (err) {
      setPasteFromJsonOpen(false);
      if (err instanceof UnsupportedVersionError) {
        setPasteErrorTitle('Unsupported Version');
        setPasteErrorMessage(err.message);
      } else if (err instanceof SceneInvariantError) {
        const summary = err.violations
          .slice(0, 3)
          .map(v => `[${v.path}] ${v.reason}`)
          .join('\n');
        const extra = err.violations.length > 3
          ? `\n…and ${err.violations.length - 3} more.`
          : '';
        setPasteErrorTitle('Invalid Scene Data');
        setPasteErrorMessage(`Scene validation failed:\n${summary}${extra}`);
      } else {
        setPasteErrorTitle('Import Failed');
        setPasteErrorMessage(err instanceof Error ? err.message : String(err));
      }
      setPasteErrorOpen(true);
      return;
    }

    if (nodes.length === 0) {
      setPasteFromJsonOpen(false);
      return;
    }

    // Wrap all AddNodeCommands in a single MultiCmdsCommand for atomic undo.
    const cmds = nodes.map(n => new AddNodeCommand(e, n));
    e.execute(new MultiCmdsCommand(e, cmds));
    setPasteFromJsonOpen(false);
  };

  // `handle` type inferred from LocalProjectManager.openRecent() — avoids direct
  // FileSystemDirectoryHandle reference in non-LocalProject* file (ESLint rule G1).
  const openProject = async (handle: NonNullable<Awaited<ReturnType<typeof projectManager.openRecent>>>) => {
    const e = new Editor(projectManager, new HttpAssetClient());
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
      resolveSyncConflict: (choice) => autosaveHandle?.resolveConflict(choice) ?? Promise.resolve(),
      currentUser,
      setCurrentUser,
      ...makeAuthCallbacks(authClient),
    });

    registerEditorKeybindings(e);
    e.keybindings.attach();

    setEditor(e);
    setBridge(b);
    setProjectOpen(true);

    // Persist for auto-restore on next page reload
    if (projectManager.currentId) setLastProjectId(projectManager.currentId);
    // Persist active project kind for cold-start resume (spec § D-6)
    try {
      localStorage.setItem('activeProject', JSON.stringify({ kind: 'local' }));
    } catch { /* localStorage disabled — auto-restore silently skipped */ }
  };

  const closeProject = async () => {
    const e = editor();
    const b = bridge();
    if (!e || !b) return;
    setProjectOpen(false);
    setOfflineCachedMode(false);

    // flush pending autosave before teardown
    await autosaveHandle?.flushNow();
    autosaveHandle?.dispose();
    autosaveHandle = null;

    // 地雷 2：確實 off sceneReplaced
    if (onSceneReplaced) {
      e.sceneDocument.events.off('sceneReplaced', onSceneReplaced);
      onSceneReplaced = null;
    }

    // L3-A3: destroy realtime client before bridge dispose
    if (activeRealtimeClient) {
      activeRealtimeClient.destroy();
      activeRealtimeClient = null;
    }

    b.dispose();
    sharedGrid?.dispose();
    sharedGrid = null;
    e.dispose();

    // Close cloud manager if active (cloud project lifecycle)
    if (activeCloudManager) {
      void activeCloudManager.close();
      activeCloudManager = null;
    } else {
      projectManager.closeSync();
    }

    // Dispose cross-tab reload coordinator (#1006)
    if (activeCloudTabCoord) {
      activeCloudTabCoord.dispose();
      activeCloudTabCoord = null;
    }

    setBridge(null);
    setEditor(null);

    // Explicit close → don't auto-restore on next reload
    clearLastProjectId();
    // Clear active project kind (spec § D-6 + G4 closeProject lifecycle)
    try {
      localStorage.removeItem('activeProject');
    } catch { /* localStorage disabled */ }
  };

  const openProjectById = async (id: string) => {
    const handle = await projectManager.openRecent(id);
    if (!handle) throw new Error('Failed to open project (permission?)');
    await closeProject();
    await openProject(handle);
  };

  /**
   * Open a cloud project by sceneId.
   * Wires CloudProjectManager + createCloudAutoSave (no local file write).
   * LocalProject path is 100% unaffected — this function is a parallel entry point.
   *
   * @param resolvedUser - Optional: pre-resolved user from an awaited auth call (cold-start
   *   path). Avoids reading the signal before setCurrentUser() has fired. Other callers
   *   (Welcome, onCreate) omit this and fall back to the signal (safe — they run after the
   *   auth gate in JSX ensures currentUser() is already resolved).
   *
   * Spec: docs/cloud-project-spec.md § Client Flow § Open cloud project
   */
  const openCloudProject = async (sceneId: string, resolvedUser?: User | null) => {
    await closeProject();

    // CloudProjectManager owns the cloud scene lifecycle
    const cloudManager = new CloudProjectManager(
      sceneId,
      syncEngine,
      new HttpAssetClient(),
    );
    activeCloudManager = cloudManager;

    // Load scene from server (with IndexedDB cache fallback on NetworkError).
    // fromCache is true when the scene was served from IndexedDB (offline cold-start).
    const { doc: sceneDocument, fromCache } = await cloudManager.loadScene();

    // Editor still uses LocalProjectManager for local-only concerns
    // (PrefabRegistry, GridHelpers, key bindings) — D-1 constraint.
    // We do NOT call editor.init() which would trigger local IDB→file migration.
    const e = new Editor(projectManager, new HttpAssetClient());
    e.syncEngine = syncEngine;
    e.syncSceneId = sceneId;
    e.syncBaseVersion = cloudManager.currentVersion ?? 0;

    // spec § Offline 策略: 冷啟動有 cache → read-only mode.
    // Editor.execute() / undo() / redo() are all gated on editor.readOnly.
    if (fromCache) {
      e.setReadOnly(true);
    }

    await e.loadScene(sceneDocument.serialize());

    // Cloud AutoSave: debounced PUT via CloudProjectManager.saveScene
    autosaveHandle = createCloudAutoSave(e, cloudManager);

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

    const deleteCloudProject = () => {
      void (async () => {
        const apiBase = defaultBaseUrl();
        let res: Response;
        try {
          res = await fetch(`${apiBase}/scenes/${encodeURIComponent(sceneId)}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        } catch {
          // Network error path: close anyway; user can retry from Welcome after reconnecting.
          await closeProject();
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
          const human = body?.error ?? `Failed to delete cloud project: ${res.status}`;
          const message = body?.code ? `${human} (${body.code})` : human;
          alert(message);
          return;
        }
        await closeProject();
      })();
    };

    // L3-A3: Mount RealtimeClient for cloud projects when user is signed in.
    // Use resolvedUser (passed from cold-start path) to avoid a race where
    // currentUser() is still undefined while authClient.getCurrentUser() is in-flight.
    // Other callers (Welcome) omit resolvedUser and fall back to the signal — safe
    // because those paths execute only after the auth gate in JSX is passed.
    const user = resolvedUser !== undefined ? resolvedUser : currentUser();
    let realtimeClient: RealtimeClient | undefined;
    if (user) {
      try {
        realtimeClient = new RealtimeClient(sceneId, user);
        activeRealtimeClient = realtimeClient;
      } catch (err) {
        // Non-fatal — presence features disabled for this session.
        console.warn('[App] Failed to mount RealtimeClient:', err);
      }
    }

    const b = createEditorBridge(e, sharedGridObjects, {
      closeProject,
      projectManager,
      projectName: cloudManager.name,
      projectType: 'cloud',
      openProjectById,
      autosaveFlush: () => autosaveHandle?.flushNow() ?? Promise.resolve(),
      resolveSyncConflict: (choice) => autosaveHandle?.resolveConflict(choice) ?? Promise.resolve(),
      currentUser,
      setCurrentUser,
      ...makeAuthCallbacks(authClient),
      deleteCloudProject,
      realtimeClient,
    });

    registerEditorKeybindings(e);
    e.keybindings.attach();

    setEditor(e);
    setBridge(b);
    setProjectOpen(true);
    setOfflineCachedMode(fromCache);

    // #1006 Cross-tab cache invalidation: when another tab saves a newer version of this
    // scene, reload the scene body from the server so this tab sees the update automatically.
    // We use a dedicated MultiTabCoord (not shared with CloudAutoSave) so disposal is
    // independent and the channels are separate instances (no self-echo from our own saves).
    const tabCoord = createMultiTabCoord();
    activeCloudTabCoord = tabCoord;
    tabCoord.onVersionChanged(sceneId, (remoteVersion) => {
      // Guard: only reload if we have an active cloudManager bound to this scene,
      // the editor is still open, and the remote version is newer than what we have.
      const cm = activeCloudManager;
      const currentEditor = editor();
      if (!cm || cm.sceneId !== sceneId || !currentEditor) return;
      if (cm.currentVersion !== null && remoteVersion <= cm.currentVersion) return;

      // Reload scene from server to reflect the other tab's changes.
      // Fire-and-forget: if the reload fails (offline/error), we stay on the cached state.
      void (async () => {
        try {
          // Destructure .doc; ignore fromCache — cross-tab reload fires while the
          // editor is already open, so we must NOT flip read-only mode here even if
          // the reload happens to hit the cache (e.g. transient network blip).
          const { doc: freshDoc } = await cm.loadScene();
          // INTENTIONAL bypass of Editor.loadScene(): cloud asset URLs are already
          // cloud-resolvable (assets://<hash>/<filename>) and don't need re-hydration
          // through AssetResolver. Going through loadScene() would re-trigger asset
          // hydration + brokenRefs scan that's redundant for cloud refresh and could
          // race with the in-flight server state.
          //
          // Suppress AutoSave while overwriting the local scene with the server
          // snapshot — without this, the deserialize() emits sceneReplaced which
          // re-triggers a push, broadcasts a new version, and another tab reloads
          // → echo storm that silently overwrites unsaved in-flight user edits
          // (refs T5/T6 stability report 2026-05-14).
          autosaveHandle?.suppress?.(true);
          try {
            currentEditor.sceneDocument.deserialize(freshDoc.serialize());
            currentEditor.syncBaseVersion = cm.currentVersion ?? remoteVersion;
          } finally {
            autosaveHandle?.suppress?.(false);
          }
        } catch (err) {
          // Non-fatal: other tab's changes simply won't appear until manual reload.
          console.warn('[App] Cross-tab scene reload failed:', err);
        }
      })();
    });

    // Persist cloud project for cold-start auto-resume (spec § Cold start with active cloud project)
    try {
      localStorage.setItem('activeProject', JSON.stringify({ kind: 'cloud', sceneId }));
    } catch { /* localStorage disabled — cold-start resume silently skipped */ }
  };

  // Persist active scene path per-project so reload resumes the right scene.
  createEffect(() => {
    const path = projectManager.currentScenePath();
    const id = projectManager.currentId;
    if (id) setLastScenePath(id, path);
  });

  // Auto-restore last opened project on page reload, or enter viewer mode if URL is /scenes/{uuid}
  onMount(() => {
    // Detect auth_error from OAuth callback redirect and clean URL immediately
    const rawAuthError = new URLSearchParams(window.location.search).get('auth_error');
    const parsedAuthError = parseAuthErrorCode(rawAuthError);
    if (parsedAuthError !== null) {
      setAuthError(parsedAuthError);
      history.replaceState({}, '', '/');
    }

    // Resolve auth state on mount (fire-and-forget, parallel to route logic)
    void (async () => {
      try {
        const user = await authClient.getCurrentUser();
        setCurrentUser(user); // User | null
      } catch (err) {
        if (err instanceof AuthError) {
          setCurrentUser(null); // 降級訪客
        } else {
          throw err;
        }
      }
    })();

    const route = currentRoute();

    if (route.kind === 'scene') {
      // URL has ?share_token=<token> — anonymous share viewer mode
      if (route.shareToken) {
        const { sceneId, shareToken } = route;
        void (async () => {
          try {
            const apiBase = defaultBaseUrl();
            const res = await fetch(
              `${apiBase}/scenes/${encodeURIComponent(sceneId)}?share_token=${encodeURIComponent(shareToken)}`,
              { credentials: 'include' },
            );
            if (!res.ok) {
              // Invalid or revoked token → show error viewer
              setViewerTokenInvalid(true);
              setViewerSceneId(sceneId);
              setViewerShareToken(shareToken);
              return;
            }
            const data = await res.json() as {
              id: string;
              owner_id: string;
              name: string;
              version: number;
              body: unknown;
              visibility: string;
            };
            // Start with owner_id as placeholder; resolve to github_login via #1017 endpoint.
            setViewerSceneId(sceneId);
            setViewerSceneName(data.name ?? sceneId);
            setViewerShareToken(shareToken);
            setViewerSharedBy(data.owner_id); // placeholder until resolved below

            // Resolve owner_id → github_login (#1017: GET /api/users/:id)
            void authClient.getUser(data.owner_id).then((publicUser) => {
              if (publicUser) {
                setViewerSharedBy(publicUser.githubLogin);
              }
            }).catch(() => {
              // Leave as UUID placeholder on error — non-critical
            });
          } catch {
            // Network error — show invalid page
            setViewerTokenInvalid(true);
            setViewerSceneId(sceneId);
            setViewerShareToken(shareToken);
          }
        })();
        return;
      }

      // URL is /scenes/{uuid} (no share_token) — check if we own this scene locally
      void (async () => {
        try {
          await syncEngine.fetch(route.sceneId);
          // 200 — scene exists & is readable. Try owner path (resume local project).
          const lastId = getLastProjectId();
          if (lastId) {
            const handle = await projectManager.openRecent(lastId);
            if (handle) {
              await openProject(handle);
              return;
            }
            clearLastProjectId();
          }
          // No local project — anonymous / non-owner viewing public scene.
          // Enter viewer mode so they see ViewerShell with Fork prompt (spec § 294).
          setViewerSceneId(route.sceneId);
          setViewerSceneName(route.sceneId);
        } catch (err) {
          if (err instanceof NotFoundError || err instanceof AuthError) {
            // Not found locally / session-required → guest viewer mode.
            // (Server returns 404 for private scenes to anonymous, so AuthError
            // here is rare — typically an expired session; user can re-sign-in
            // via the Fork prompt inside the viewer.)
            setViewerSceneId(route.sceneId);
            setViewerSceneName(route.sceneId);
          }
          // Other errors: fall through to Welcome
        }
      })();
      return;
    }

    // Default: /  — auto-restore last opened project
    // Check for active cloud project first (cold-start resume, spec § D-6)
    const activeProjectRaw = localStorage.getItem('activeProject');
    if (activeProjectRaw) {
      try {
        const activeProject = JSON.parse(activeProjectRaw) as { kind: string; sceneId?: string };
        if (activeProject.kind === 'cloud' && activeProject.sceneId) {
          // Cloud cold-start: await auth resolution, then resume if signed in.
          // spec § Cold start with active cloud project: "currentUser() resolved + non-null"
          const sceneIdToResume = activeProject.sceneId;
          void (async () => {
            try {
              // Resolve auth (getCurrentUser is already running above in parallel;
              // await it here so we only attempt cloud resume when we know the user state).
              const user = await authClient.getCurrentUser();
              if (!user) {
                // Guest — don't auto-open cloud project; show Welcome
                return;
              }
              // Pass awaited user to avoid cold-start race: currentUser() signal may
              // still be undefined when openCloudProject runs (setCurrentUser fires later).
              await openCloudProject(sceneIdToResume, user);
            } catch {
              // Failed (offline/unauth) — clear and show Welcome
              try { localStorage.removeItem('activeProject'); } catch { /* ignore */ }
            }
          })();
          return;
        }
      } catch {
        try { localStorage.removeItem('activeProject'); } catch { /* ignore */ }
      }
    }

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

  // When viewer forks and navigates to /scenes/{newId}, clear viewer mode so the
  // regular editor flow can take over (user will open project to edit the fork)
  createEffect(() => {
    const route = currentRoute();
    if (route.kind === 'home' || (route.kind === 'scene' && route.sceneId !== viewerSceneId())) {
      setViewerSceneId(null);
    }
  });

  onCleanup(() => { void closeProject(); });

  // Viewer mode: URL is /scenes/{uuid} and scene is not locally owned
  const isViewerMode = () => viewerSceneId() !== null;

  return (
    <>
      <AuthErrorOverlay code={authError()} onDismiss={() => setAuthError(null)} />
      {/* G6 — Offline banner: only for cloud projects, not local. Not dismissible. */}
      <Show when={offlineCachedMode()}>
        <OfflineBanner cached />
      </Show>
      <Show when={!offlineCachedMode() && isOffline() && bridge() !== null && bridge()!.projectType() === 'cloud'}>
        <OfflineBanner />
      </Show>
      <Show when={bridge() !== null}>
        <SyncErrorOverlay
          error={bridge()!.syncError()}
          onDismiss={() => bridge()!.dismissSyncError()}
        />
      </Show>
      <Show
        when={!isViewerMode()}
        fallback={
          <Show
            when={!viewerTokenInvalid()}
            fallback={
              <ShareTokenInvalidView />
            }
          >
            <Show
              when={viewerShareToken() !== undefined}
              fallback={
                <ViewerShell
                  sceneId={viewerSceneId()!}
                  sceneName={viewerSceneName()}
                  syncEngine={syncEngine}
                  onSignIn={() => { window.location.href = authClient.getOAuthStartUrl('github'); }}
                />
              }
            >
              <ShareTokenViewerShell
                sceneId={viewerSceneId()!}
                sceneName={viewerSceneName()}
                sharedBy={viewerSharedBy()}
                syncEngine={syncEngine}
                onSignIn={() => { window.location.href = authClient.getOAuthStartUrl('github'); }}
              />
            </Show>
          </Show>
        }
      >
        <Show when={projectOpen() && editor() && bridge()} fallback={
          <Welcome
            projectManager={projectManager}
            onOpenProject={openProjectById}
            currentUser={currentUser}
            listCloudScenes={() => authClient.listCloudScenes()}
            onOpenCloudProject={async (sceneId) => {
              await openCloudProject(sceneId);
            }}
            onCreateCloudProject={async (name) => {
              // Create cloud scene via POST /api/scenes, then open via CloudProjectManager (G2+G4).
              const apiBase = defaultBaseUrl();
              const res = await fetch(`${apiBase}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, body: createEmptyScene() }),
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
                if (body?.error) {
                  throw new Error(body.code ? `${body.error} (${body.code})` : body.error);
                }
                throw new Error(`Failed to create cloud project: ${res.status}`);
              }
              const data = await res.json() as { id: string };
              await openCloudProject(data.id);
            }}
            onDeleteCloudProject={async (sceneId) => {
              const apiBase = defaultBaseUrl();
              const res = await fetch(`${apiBase}/scenes/${encodeURIComponent(sceneId)}`, {
                method: 'DELETE',
                credentials: 'include',
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
                if (body?.error) {
                  throw new Error(body.code ? `${body.error} (${body.code})` : body.error);
                }
                throw new Error(`Failed to delete cloud project: ${res.status}`);
              }
            }}
            onOpenOAuth={() => { window.location.href = authClient.getOAuthStartUrl('github'); }}
            onRequestMagicLink={(email) => authClient.requestMagicLink(email)}
          />
        }>
          <EditorProvider bridge={bridge()!} editors={editors}>
            <div class={styles.root}>
              <Toolbar />
              <div class={styles.contentArea}>
                <AreaTreeRenderer />
              </div>
              <StatusBar bridge={bridge()!} />
            </div>
            <SyncConflictDialog
              conflict={bridge()!.syncConflict()}
              onKeepLocal={() => void bridge()!.resolveSyncConflict('keep-local')}
              onUseCloud={() => void bridge()!.resolveSyncConflict('use-cloud')}
            />
            <CopyAsJsonModal
              open={copyAsJsonOpen()}
              json={copyAsJsonContent()}
              onClose={() => setCopyAsJsonOpen(false)}
            />
            <PasteFromJsonModal
              open={pasteFromJsonOpen()}
              onImport={handlePasteImport}
              onClose={() => setPasteFromJsonOpen(false)}
            />
            <ErrorDialog
              open={pasteErrorOpen()}
              title={pasteErrorTitle()}
              message={pasteErrorMessage()}
              onClose={() => setPasteErrorOpen(false)}
            />
          </EditorProvider>
        </Show>
      </Show>
    </>
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

// ---------------------------------------------------------------------------
// ShareTokenViewerShell — viewer mode for anonymous share URL
// Shows "Shared by <owner>" badge + Fork button + "Sign in to edit" footer
// ---------------------------------------------------------------------------

interface ShareTokenViewerProps {
  sceneId: string;
  sceneName: string;
  sharedBy?: string;
  syncEngine: { fork(id: string, name?: string): Promise<{ id: string; version: number; forkedFrom: string }> };
  onSignIn: () => void;
}

const ShareTokenViewerShell: Component<ShareTokenViewerProps> = (props) => {
  const [forking, setForking] = createSignal(false);
  const [forkError, setForkError] = createSignal<string | null>(null);
  const [needsAuth, setNeedsAuth] = createSignal(false);

  const handleFork = async () => {
    if (forking()) return;
    setForking(true);
    setForkError(null);
    setNeedsAuth(false);
    try {
      const result = await props.syncEngine.fork(props.sceneId);
      navigateToScene(result.id);
    } catch (err) {
      if (err instanceof AuthError) {
        setNeedsAuth(true);
      } else {
        setForkError(err instanceof Error ? err.message : 'Fork failed');
      }
      setForking(false);
    }
  };

  return (
    <div class={viewerStyles.root}>
      {/* Viewer header */}
      <div class={viewerStyles.header}>
        <span class={viewerStyles.viewingLabel}>Viewing</span>
        <span class={viewerStyles.sceneName}>{props.sceneName}</span>
        <Show when={props.sharedBy}>
          <span class={viewerStyles.sharedBy}>· Shared by {props.sharedBy}</span>
        </Show>
        <Show when={forkError()}>
          <span role="alert" aria-live="polite" class={viewerStyles.errorText}>
            &nbsp;— {forkError()}
          </span>
        </Show>
        <div class={viewerStyles.spacer} />
        <Show
          when={!needsAuth()}
          fallback={
            <button
              class={viewerStyles.forkButton}
              onClick={props.onSignIn}
            >
              Sign in to fork
            </button>
          }
        >
          <button
            data-testid="share-viewer-fork"
            disabled={forking()}
            class={viewerStyles.forkButton}
            onClick={() => void handleFork()}
          >
            <span aria-live="polite">{forking() ? 'Forking…' : 'Fork'}</span>
          </button>
        </Show>
      </div>
      {/* Viewer content placeholder */}
      <div class={viewerStyles.content}>
        <span>Loading scene…</span>
      </div>
      {/* Footer */}
      <div class={viewerStyles.footer}>
        Sign in to edit your own copy —{' '}
        <button
          class={viewerStyles.footerLink}
          onClick={props.onSignIn}
        >
          Sign in
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ShareTokenInvalidView — shown when share token is invalid or revoked
// ---------------------------------------------------------------------------

const ShareTokenInvalidView: Component = () => {
  return (
    <div data-testid="share-token-invalid" class={viewerStyles.invalidRoot}>
      <p class={viewerStyles.invalidTitle}>Link not found</p>
      <p class={viewerStyles.invalidMessage}>
        This share link is invalid or revoked. Ask the owner for a new link.
      </p>
    </div>
  );
};

export default App;
