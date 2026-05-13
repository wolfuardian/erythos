import { type Component, onMount, Show, For } from 'solid-js';
import { LocalProjectManager } from '../core/project/LocalProjectManager';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';
import { NewProjectModal } from './NewProjectModal';
import { createSignal } from 'solid-js';
import styles from './Welcome.module.css';

interface Props {
  projectManager: LocalProjectManager;
  onOpenProject: (id: string) => Promise<void>;
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
  const [errorMsg, setErrorMsg] = createSignal('');

  const refresh = async () => setRecentProjects(await props.projectManager.getRecentProjects());

  onMount(() => {
    void refresh();
    const unsub = props.projectManager.onChange(() => void refresh());
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
              onClick={() => setShowModal(true)}
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
            <div class={styles.footerText}>v0.1 — Local-first 3D editor</div>
            <div class={styles.footerSub}>Cloud sync coming in v0.2</div>
          </div>
        </div>

        {/* Right column ~62% */}
        <div class={styles.rightCol}>
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
        onAfterCreate={() => void refresh()}
      />
    </div>
  );
};
