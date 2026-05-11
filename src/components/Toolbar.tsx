import { type Component, For, Show, createEffect, createSignal } from 'solid-js';
import { BrandMark } from './BrandMark';
import { BrokenRefsBadge } from './BrokenRefsBadge';
import { ProjectChip } from './ProjectChip';
import { ShareDialog, type SceneVisibility } from './ShareDialog';
import { UserMenu } from './UserMenu';
import { useEditor } from '../app/EditorContext';
import { clearSavedLayout } from '../app/workspaceStore';
import { store, mutate, addWorkspace } from '../app/workspaceStore';
import { WorkspaceTab } from '../app/layout/WorkspaceTab';
import styles from './Toolbar.module.css';

export const Toolbar: Component = () => {
  const bridge = useEditor();
  const tabRefs = new Map<string, HTMLElement>();
  const [shareOpen, setShareOpen] = createSignal(false);
  const [shareVisibility, setShareVisibility] = createSignal<SceneVisibility>('private');
  const [shareError, setShareError] = createSignal<string | null>(null);

  // When dialog opens, fetch current visibility from SyncEngine
  createEffect(() => {
    if (!shareOpen()) return;
    const sceneId = bridge.currentSceneId();
    const syncEngine = bridge.editor.syncEngine;
    if (!sceneId || !syncEngine) return;
    setShareError(null);
    void syncEngine.fetch(sceneId).then((result) => {
      setShareVisibility(result.visibility);
    }).catch((err: unknown) => {
      setShareError(err instanceof Error ? err.message : 'Failed to load visibility');
    });
  });

  const handleVisibilityChange = (vis: SceneVisibility) => {
    const sceneId = bridge.currentSceneId();
    const syncEngine = bridge.editor.syncEngine;
    if (!sceneId || !syncEngine) return;
    const prev = shareVisibility();
    setShareVisibility(vis); // optimistic update
    void syncEngine.setVisibility(sceneId, vis).catch((err: unknown) => {
      setShareError(err instanceof Error ? err.message : 'Failed to update visibility');
      setShareVisibility(prev); // rollback to captured prev
    });
  };

  return (
    <div
      data-testid="toolbar"
      class={styles.toolbar}
    >
      {/* Brand mark */}
      <div
        data-testid="toolbar-brand-mark"
        class={styles.brandMark}
      >
        <BrandMark appVersion={__APP_VERSION__} />
      </div>

      {/* Project section */}
      <div
        data-testid="toolbar-project"
        class={styles.project}
      >
        <ProjectChip
          projectName={bridge.projectName() ?? ''}
          autosaveStatus={bridge.autosaveStatus()}
          onCloseProject={bridge.closeProject}
          recentProjects={bridge.recentProjects()}
          currentProjectId={bridge.currentProjectId()}
          onOpenProject={bridge.openProjectById}
        />
      </div>

      {/* Broken-ref warning chip — only renders when count > 0 (spec round 8). */}
      <div
        data-testid="toolbar-broken-refs"
        class={styles.brokenRefs}
      >
        <BrokenRefsBadge />
      </div>

      {/* Spacer */}
      <div class={styles.spacer} />

      {/* Workspace tabs area */}
      <div
        data-testid="toolbar-workspace-tabs"
        class={styles.workspaceTabs}
      >
        <For each={store().workspaces}>
          {(w) => (
            <WorkspaceTab
              workspace={w}
              ref={(el) => tabRefs.set(w.id, el)}
              tabRefs={tabRefs}
            />
          )}
        </For>

        {/* Ghost "+" button */}
        <button
          type="button"
          onClick={() => mutate(s => addWorkspace(s))}
          title="Duplicate current workspace"
          aria-label="Duplicate current workspace"
          class={styles.addWorkspaceButton}
        >
          +
        </button>
      </div>

      {/* Split divider */}
      <div class={styles.divider} />

      {/* Share button — disabled until scene has a sync ID */}
      <button
        data-testid="toolbar-share"
        onClick={() => setShareOpen(true)}
        title="Share scene"
        class={styles.shareButton}
        disabled={bridge.currentSceneId() === null}
      >
        Share
      </button>

      {/* Reset Layout icon button */}
      <button
        data-testid="toolbar-reset-layout"
        onClick={() => { clearSavedLayout(); location.reload(); }}
        title="Reset panel layout to default"
        aria-label="Reset panel layout"
        class={styles.resetLayoutButton}
      >
        ↺
      </button>

      {/* Auth section — three-state: undefined (loading) / null (guest) / User (signed in) */}
      <Show when={bridge.currentUser() !== undefined}>
        <div class={styles.divider} />
        <Show
          when={bridge.currentUser()}
          fallback={
            /* null → Sign in button */
            <button
              data-testid="toolbar-sign-in"
              type="button"
              class={styles.shareButton}
              onClick={() => { window.location.href = bridge.getOAuthStartUrl('github'); }}
              title="Sign in with GitHub"
            >
              Sign in
            </button>
          }
        >
          {(user) => (
            /* User → avatar chip + dropdown */
            <UserMenu
              user={user()}
              onSignOut={bridge.signOut}
              onExportData={() => { window.location.href = bridge.getExportUrl(); }}
              onDeleteAccount={bridge.deleteAccount}
            />
          )}
        </Show>
      </Show>

      <ShareDialog
        open={shareOpen()}
        onClose={() => { setShareOpen(false); setShareError(null); }}
        sceneId={bridge.currentSceneId() ?? ''}
        visibility={shareVisibility()}
        onVisibilityChange={handleVisibilityChange}
      />
      <Show when={shareOpen() && shareError()}>
        <div data-testid="share-error" class={styles.shareError}>
          {shareError()}
        </div>
      </Show>
    </div>
  );
};
