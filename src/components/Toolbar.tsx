import { type Component, For, Show, createEffect, createSignal } from 'solid-js';
import { BrandMark } from './BrandMark';
import { BrokenRefsBadge } from './BrokenRefsBadge';
import { ProjectChip } from './ProjectChip';
import { ShareDialog, type SceneVisibility } from './ShareDialog';
import { SignInDialog } from './SignInDialog';
import { UserMenu } from './UserMenu';
import { useEditor } from '../app/EditorContext';
import { clearSavedLayout } from '../app/workspaceStore';
import { store, mutate, addWorkspace } from '../app/workspaceStore';
import { WorkspaceTab } from '../app/layout/WorkspaceTab';
import { ShareTokenClient } from '../core/sync/ShareTokenClient';
import type { ShareToken } from '../core/sync/ShareTokenClient';
import styles from './Toolbar.module.css';

const shareTokenClient = new ShareTokenClient();

export const Toolbar: Component = () => {
  const bridge = useEditor();
  const tabRefs = new Map<string, HTMLElement>();
  const [shareOpen, setShareOpen] = createSignal(false);
  const [shareVisibility, setShareVisibility] = createSignal<SceneVisibility>('private');
  const [shareError, setShareError] = createSignal<string | null>(null);
  const [signInOpen, setSignInOpen] = createSignal(false);
  // Token state — undefined = not loaded (non-owner or not yet fetched)
  const [shareTokens, setShareTokens] = createSignal<ShareToken[] | undefined>(undefined);
  const [tokenError, setTokenError] = createSignal<string | null>(null);
  let signInTriggerRef: HTMLButtonElement | undefined;

  // When dialog opens, fetch current visibility + tokens (if owner)
  createEffect(() => {
    if (!shareOpen()) return;
    const sceneId = bridge.currentSceneId();
    const syncEngine = bridge.editor.syncEngine;
    if (!sceneId || !syncEngine) return;
    setShareError(null);
    setTokenError(null);
    setShareTokens(undefined);

    // Load visibility
    void syncEngine.fetch(sceneId).then((result) => {
      setShareVisibility(result.visibility);
    }).catch((err: unknown) => {
      setShareError(err instanceof Error ? err.message : 'Failed to load visibility');
    });

    // Load tokens — only succeeds if caller is owner (returns undefined on 404/401)
    void shareTokenClient.list(sceneId).then((tokens) => {
      setShareTokens(tokens);
    }).catch(() => {
      // Non-owner or error: leave tokens as undefined (hide token section)
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

  const handleGenerateToken = async () => {
    const sceneId = bridge.currentSceneId();
    if (!sceneId) return;
    setTokenError(null);
    try {
      const generated = await shareTokenClient.generate(sceneId);
      // Append new token to existing list
      setShareTokens((prev) => [
        ...(prev ?? []),
        { token: generated.token, created_at: generated.created_at, revoked_at: null },
      ]);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Failed to generate token');
    }
  };

  const handleRevokeToken = async (token: string) => {
    const sceneId = bridge.currentSceneId();
    if (!sceneId) return;
    setTokenError(null);
    try {
      await shareTokenClient.revoke(sceneId, token);
      // Mark token as revoked in local state
      setShareTokens((prev) =>
        prev?.map((t) =>
          t.token === token ? { ...t, revoked_at: new Date().toISOString() } : t,
        ),
      );
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
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
        {/* Cloud sync indicator — shown in cloud project mode (G3) */}
        <Show when={bridge.projectType() === 'cloud'}>
          <div
            data-testid="toolbar-cloud-sync"
            class={styles.cloudSync}
            classList={{
              [styles.cloudSyncPending]: bridge.autosaveStatus() === 'pending',
              [styles.cloudSyncSaved]: bridge.autosaveStatus() === 'saved',
              [styles.cloudSyncError]: bridge.autosaveStatus() === 'error',
            }}
            title={
              bridge.autosaveStatus() === 'pending' ? 'Syncing to cloud…'
              : bridge.autosaveStatus() === 'saved' ? 'Synced to cloud'
              : bridge.autosaveStatus() === 'error' ? 'Cloud sync error'
              : 'Cloud project'
            }
          >
            Cloud
          </div>
        </Show>
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

      {/* Share button — visible when there is a sync ID;
          owner-check is done lazily via token load on dialog open */}
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
            /* null → Sign in button — opens dialog with GitHub + magic-link options */
            <button
              ref={(el) => { signInTriggerRef = el; }}
              data-testid="toolbar-sign-in"
              type="button"
              class={styles.shareButton}
              onClick={() => setSignInOpen(true)}
              title="Sign in"
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
        onClose={() => { setShareOpen(false); setShareError(null); setTokenError(null); }}
        sceneId={bridge.currentSceneId() ?? ''}
        visibility={shareVisibility()}
        onVisibilityChange={handleVisibilityChange}
        tokens={shareTokens()}
        onGenerateToken={handleGenerateToken}
        onRevokeToken={handleRevokeToken}
        tokenError={tokenError()}
      />
      <Show when={shareOpen() && shareError()}>
        <div data-testid="share-error" class={styles.shareError}>
          {shareError()}
        </div>
      </Show>

      <SignInDialog
        open={signInOpen()}
        onOpenOAuth={() => { window.location.href = bridge.getOAuthStartUrl('github'); }}
        onRequestMagicLink={bridge.requestMagicLink}
        onClose={() => setSignInOpen(false)}
        triggerRef={signInTriggerRef ?? null}
      />
    </div>
  );
};
