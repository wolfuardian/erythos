import { type Component, createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { AssetPath } from '../utils/branded';
import { Editor } from '../core/Editor';
import { HttpAssetClient } from '../core/sync/asset/HttpAssetClient';
import { createAutoSave, type AutoSaveHandle } from '../core/scene/AutoSave';
import { HttpSyncEngine } from '../core/sync/HttpSyncEngine';
import { defaultBaseUrl } from '../core/sync/baseUrl';
import { AuthClient, AuthError, type User } from '../core/auth/AuthClient';
import { LocalProjectManager } from '../core/project/LocalProjectManager';
import { RemoveNodeCommand } from '../core/commands/RemoveNodeCommand';
import { AddNodeCommand } from '../core/commands/AddNodeCommand';
import { MultiCmdsCommand } from '../core/commands/MultiCmdsCommand';
import { createEditorBridge, type EditorBridge } from './bridge';
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
import { NotFoundError } from '../core/sync/SyncEngine';
import {
  DEFAULT_SCENE_PATH,
  getLastProjectId, setLastProjectId, clearLastProjectId,
  getLastScenePath, setLastScenePath, clearLastScenePath,
} from './projectSession';
import { currentRoute, navigateToScene } from './router';
import { ViewerShell } from './ViewerBanner';
import { AuthErrorOverlay, parseAuthErrorCode, type AuthErrorCode } from './AuthErrorBanner';
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

  // currentUser signal: undefined = unresolved, null = guest, User = signed in
  const [currentUser, setCurrentUser] = createSignal<User | null | undefined>(undefined);

  const [editor, setEditor] = createSignal<Editor | null>(null);
  const [bridge, setBridge] = createSignal<EditorBridge | null>(null);
  const [projectOpen, setProjectOpen] = createSignal(false);
  let sharedGrid: GridHelpers | null = null;
  let autosaveHandle: AutoSaveHandle | null = null;

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
      authSignOut: () => authClient.signOut(),
      authGetOAuthStartUrl: (provider) => authClient.getOAuthStartUrl(provider),
      authGetExportUrl: () => authClient.getExportUrl(),
      authDeleteAccount: () => authClient.deleteAccount(),
      authRequestMagicLink: (email) => authClient.requestMagicLink(email),
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
    projectManager.closeSync();
    setBridge(null);
    setEditor(null);

    // Explicit close → don't auto-restore on next reload
    clearLastProjectId();
  };

  const openProjectById = async (id: string) => {
    const handle = await projectManager.openRecent(id);
    if (!handle) throw new Error('Failed to open project (permission?)');
    await closeProject();
    await openProject(handle);
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
              // G2 not yet landed — store intent and notify user.
              // Once G2 merges, App.tsx will handle this via CloudProjectManager.
              console.warn('[G3] openCloudProject stub — G2 CloudProjectManager not yet landed', sceneId);
            }}
            onCreateCloudProject={async (name) => {
              // Create cloud scene via POST /api/scenes, then wire to CloudProjectManager (G2).
              // For G3, we fire the POST and log the returned id — G2 will complete the flow.
              const apiBase = defaultBaseUrl();
              const res = await fetch(`${apiBase}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, body: {} }),
              });
              if (!res.ok) throw new Error(`Failed to create cloud project: ${res.status}`);
              const data = await res.json() as { id: string };
              console.warn('[G3] createCloudProject stub — G2 CloudProjectManager not yet landed', data.id);
            }}
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
