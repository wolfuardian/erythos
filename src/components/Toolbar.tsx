import { type Component, For, createSignal } from 'solid-js';
import { BrandMark } from './BrandMark';
import { BrokenRefsBadge } from './BrokenRefsBadge';
import { ProjectChip } from './ProjectChip';
import { ShareDialog, type SceneVisibility } from './ShareDialog';
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
          class={styles.addWorkspaceButton}
        >
          +
        </button>
      </div>

      {/* Split divider */}
      <div class={styles.divider} />

      {/* Share button */}
      <button
        data-testid="toolbar-share"
        onClick={() => setShareOpen(true)}
        title="Share scene"
        class={styles.shareButton}
      >
        Share
      </button>

      {/* Reset Layout icon button */}
      <button
        data-testid="toolbar-reset-layout"
        onClick={() => { clearSavedLayout(); location.reload(); }}
        title="Reset panel layout to default"
        class={styles.resetLayoutButton}
      >
        ↺
      </button>

      <ShareDialog
        open={shareOpen()}
        onClose={() => setShareOpen(false)}
        sceneId="placeholder"
        visibility={shareVisibility()}
        onVisibilityChange={setShareVisibility}
      />
    </div>
  );
};
