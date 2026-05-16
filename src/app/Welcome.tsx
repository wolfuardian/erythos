import { type Component, onMount, Show, For } from 'solid-js';
import { LocalProjectManager } from '../core/project/LocalProjectManager';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';
import { NewProjectModal } from './NewProjectModal';
import { SignInDialog } from '../components/SignInDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { createSignal } from 'solid-js';
import type { User, CloudScene } from '../core/auth/AuthClient';
import styles from './Welcome.module.css';

interface Props {
  projectManager: LocalProjectManager;
  onOpenProject: (id: string) => Promise<void>;
  /** Current authenticated user — undefined = loading, null = guest, User = signed in. */
  currentUser?: () => User | null | undefined;
  /** Fetch the signed-in user's cloud scenes. */
  listCloudScenes?: () => Promise<CloudScene[]>;
  /** Open a cloud scene by its server-side scene id. */
  onOpenCloudProject?: (sceneId: string) => Promise<void>;
  /** Create a new cloud project with the given name. */
  onCreateCloudProject?: (name: string) => Promise<void>;
  /** Permanently delete a cloud project on the server. Lets users recover from an unopenable / invalid project. */
  onDeleteCloudProject?: (sceneId: string) => Promise<void>;
  /** Open GitHub OAuth sign-in — caller navigates away. */
  onOpenOAuth?: () => void;
  /** Request a magic-link sign-in email. */
  onRequestMagicLink?: (email: string) => Promise<void>;
}

function formatLastOpened(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

// Folder SVG icon (no emoji)
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H6l1.5 1.5H13.5C14.052 4 14.5 4.448 14.5 5v7c0 .552-.448 1-1 1h-11c-.552 0-1-.448-1-1V3.5z"
      fill="var(--text-secondary)"
      opacity="0.7"
    />
    <path
      d="M1.5 5.5H14.5V12c0 .552-.448 1-1 1h-11c-.552 0-1-.448-1-1V5.5z"
      fill="var(--text-secondary)"
      opacity="0.5"
    />
  </svg>
);

// Plus icon
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 1v10M1 6h10" stroke="var(--accent-blue)" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
);

// Trash icon — for cloud project delete; matches RecentProjectsDropdown convention (no emoji, inline SVG)
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5v9h7v-9"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

// Thumbnail placeholder — 32x32 dark geometric hint
const ThumbnailPlaceholder = () => (
  <div class={styles.thumbnail}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="10,3 17,14 3,14" fill="none" stroke="var(--border-medium)" stroke-width="1" opacity="0.6"/>
      <rect x="6" y="8" width="8" height="7" fill="none" stroke="var(--border-subtle)" stroke-width="0.8" opacity="0.4"/>
    </svg>
  </div>
);

export const Welcome: Component<Props> = (props) => {
  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [showModal, setShowModal] = createSignal(false);
  const [modalKind, setModalKind] = createSignal<'local' | 'cloud'>('local');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [signInOpen, setSignInOpen] = createSignal(false);
  let signInTriggerRef: HTMLButtonElement | undefined;

  // Cloud project list — only loaded when user is signed in
  const [cloudScenes, setCloudScenes] = createSignal<CloudScene[]>([]);
  const [cloudLoading, setCloudLoading] = createSignal(false);
  const [cloudError, setCloudError] = createSignal('');
  // Cloud delete confirm — null = no dialog open
  const [deleteConfirmScene, setDeleteConfirmScene] = createSignal<CloudScene | null>(null);

  const refresh = async () => setRecentProjects(await props.projectManager.getRecentProjects());

  const refreshCloudScenes = async () => {
    if (!props.listCloudScenes) return;
    setCloudLoading(true);
    setCloudError('');
    try {
      const scenes = await props.listCloudScenes();
      setCloudScenes(scenes);
    } catch {
      setCloudError('Failed to load cloud projects');
    } finally {
      setCloudLoading(false);
    }
  };

  onMount(() => {
    void refresh();
    const unsub = props.projectManager.onChange(() => void refresh());
    // Load cloud scenes if user is already signed in when Welcome mounts
    void refreshCloudScenes();
    return unsub;
  });

  const handleOpenRecent = async (id: string) => {
    try {
      await props.onOpenProject(id);
    } catch {
      setErrorMsg('Failed to open project (permission?)');
    }
  };

  const handleAdd = async () => {
    try {
      await props.projectManager.addFromDisk();
      await refresh();
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || String(e));
    }
  };

  const handleDeleteCloud = async () => {
    const scene = deleteConfirmScene();
    if (!scene || !props.onDeleteCloudProject) return;
    setDeleteConfirmScene(null);
    setCloudError('');
    try {
      await props.onDeleteCloudProject(scene.id);
      await refreshCloudScenes();
    } catch (e: any) {
      setCloudError(e?.message ?? 'Failed to delete cloud project');
    }
  };

  return (
    <div class={styles.page}>
      {/* Main card */}
      <div class={styles.card}>
        {/* Left column ~38% */}
        <div class={styles.leftCol}>
          {/* Logo + Title */}
          <div class={styles.logoArea}>
            <div class={styles.appName}>Erythos</div>
            <div class={styles.appSubtitle}>3D Editor</div>
          </div>

          {/* Quick Start sub-header */}
          <div class={styles.subHeader}>Quick Start</div>

          {/* Tiles */}
          <div class={styles.tileList}>
            {/* New Project tile */}
            <button
              class={styles.tile}
              classList={{ [styles.accent]: true }}
              onClick={() => { setModalKind('local'); setShowModal(true); }}
            >
              <div class={styles.tileIcon}>
                <PlusIcon />
              </div>
              <div>
                <div class={styles.tileTitle}>New Project</div>
                <div class={styles.tileDesc}>Create a new 3D scene workspace</div>
              </div>
            </button>

            {/* Open Folder tile */}
            <button
              class={styles.tile}
              onClick={() => void handleAdd()}
            >
              <div class={styles.tileIcon}>
                <FolderIcon />
              </div>
              <div>
                <div class={styles.tileTitle}>Open Folder…</div>
                <div class={styles.tileDesc}>Open an existing project folder</div>
              </div>
            </button>
          </div>

          {/* Footer */}
          <div class={styles.footer}>
            <div class={styles.footerText}>v0.2 — Local + cloud 3D editor</div>
            <Show when={props.currentUser?.() === null && props.onOpenOAuth}>
              <button
                data-testid="welcome-sign-in"
                type="button"
                class={styles.signInButton}
                onClick={(e) => { signInTriggerRef = e.currentTarget; setSignInOpen(true); }}
              >
                Sign in to sync across devices
              </button>
            </Show>
            <div class={styles.legalLinks}>
              <a
                data-testid="welcome-link-privacy"
                href="https://github.com/wolfuardian/erythos/blob/main/docs/legal/PRIVACY.md"
                target="_blank"
                rel="noopener noreferrer"
                class={styles.legalLink}
              >
                Privacy
              </a>
              <span class={styles.legalSeparator}>·</span>
              <a
                data-testid="welcome-link-terms"
                href="https://github.com/wolfuardian/erythos/blob/main/docs/legal/TERMS.md"
                target="_blank"
                rel="noopener noreferrer"
                class={styles.legalLink}
              >
                Terms
              </a>
            </div>
          </div>
        </div>

        {/* Right column ~62% */}
        <div class={styles.rightCol}>
          {/* Cloud Projects section — only visible when signed in */}
          <Show when={props.currentUser && props.currentUser() != null}>
            <div class={styles.recentHeader}>
              <div class={styles.subHeader}>Your Cloud Projects</div>
              <Show when={cloudScenes().length > 0}>
                <div class={styles.recentCount}>{cloudScenes().length}</div>
              </Show>
            </div>

            <div class={styles.projectList}>
              <Show
                when={!cloudLoading()}
                fallback={
                  <div class={styles.emptyState}>
                    <span class={styles.emptyText}>Loading…</span>
                  </div>
                }
              >
                <For each={cloudScenes()} fallback={
                  <button
                    class={styles.emptyStateButton}
                    onClick={() => { setModalKind('cloud'); setShowModal(true); }}
                  >
                    <span class={styles.emptyText}>
                      No cloud projects yet — create your first one
                    </span>
                  </button>
                }>
                  {(scene) => (
                    <div
                      class={styles.cloudProjectRow}
                      onClick={() => props.onOpenCloudProject?.(scene.id)}
                    >
                      <ThumbnailPlaceholder />
                      <div class={styles.projectMeta}>
                        <div class={styles.projectName}>{scene.name || 'Untitled'}</div>
                        <div class={styles.projectId}>{scene.id}</div>
                      </div>
                      <div class={styles.projectDate}>
                        {formatLastOpened(new Date(scene.updated_at).getTime())}
                      </div>
                      <Show when={props.onDeleteCloudProject}>
                        <button
                          class={styles.deleteRowButton}
                          title="Delete this cloud project"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmScene(scene);
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            <Show when={cloudError()}>
              <div class={styles.errorMsg}>{cloudError()}</div>
            </Show>

            {/* Divider before local projects */}
            <div class={styles.sectionDivider} />
          </Show>

          {/* Signed-out: surface that cloud projects exist + offer sign-in */}
          <Show when={props.currentUser?.() === null}>
            <div class={styles.recentHeader}>
              <div class={styles.subHeader}>Your Cloud Projects</div>
            </div>
            <button
              class={styles.cloudSignedOut}
              onClick={(e) => { signInTriggerRef = e.currentTarget; setSignInOpen(true); }}
            >
              <span class={styles.emptyText}>Sign in to sync scenes across devices</span>
            </button>
            <div class={styles.sectionDivider} />
          </Show>

          {/* Recent Projects header */}
          <div class={styles.recentHeader}>
            <div class={styles.subHeader}>Recent Projects</div>
            <Show when={recentProjects().length > 0}>
              <div class={styles.recentCount}>{recentProjects().length}</div>
            </Show>
          </div>

          {/* Project list */}
          <div class={styles.projectList}>
            <For each={recentProjects()} fallback={
              <div class={styles.emptyState}>
                <span class={styles.emptyText}>No recent projects</span>
              </div>
            }>
              {(entry) => (
                <div
                  class={styles.projectRow}
                  onClick={() => void handleOpenRecent(entry.id)}
                >
                  <ThumbnailPlaceholder />
                  <div class={styles.projectMeta}>
                    <div class={styles.projectName}>{entry.name}</div>
                    <div class={styles.projectId}>{entry.id}</div>
                  </div>
                  <div class={styles.projectDate}>{formatLastOpened(entry.lastOpened)}</div>
                </div>
              )}
            </For>
          </div>

          {/* Error message */}
          <Show when={errorMsg()}>
            <div class={styles.errorMsg}>{errorMsg()}</div>
          </Show>
        </div>
      </div>

      {/* Create New Project Modal */}
      <NewProjectModal
        show={showModal}
        onClose={() => setShowModal(false)}
        projectManager={props.projectManager}
        onOpenProject={props.onOpenProject}
        onAfterCreate={() => { void refresh(); void refreshCloudScenes(); }}
        currentUser={props.currentUser}
        onCreateCloudProject={props.onCreateCloudProject}
        initialKind={modalKind()}
      />

      {/* Pre-project sign-in entry — Toolbar's sign-in is unavailable until a project opens */}
      <SignInDialog
        open={signInOpen()}
        onOpenOAuth={() => props.onOpenOAuth?.()}
        onRequestMagicLink={async (email) => { await props.onRequestMagicLink?.(email); }}
        onClose={() => setSignInOpen(false)}
        triggerRef={signInTriggerRef ?? null}
      />

      {/* Cloud project delete confirmation — list-level affordance so an unopenable / invalid project is still recoverable */}
      <ConfirmDialog
        open={deleteConfirmScene() !== null}
        title="Delete Cloud Project"
        message={`Delete "${deleteConfirmScene()?.name || 'Untitled'}"? This permanently removes it from the server and cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => void handleDeleteCloud()}
        onCancel={() => setDeleteConfirmScene(null)}
      />
    </div>
  );
};
