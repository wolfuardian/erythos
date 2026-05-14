import { type Component, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';
import styles from './RecentProjectsDropdown.module.css';

interface RecentProjectsDropdownProps {
  when: () => boolean;
  recentProjects: ProjectEntry[];
  currentProjectId: string | null;
  expanded: () => boolean;
  setExpanded: (v: boolean) => void;
  dropdownPos: () => { top: number; left: number };
  onOpenProject: (id: string) => void;
  onCloseProject: () => void;
  /** Show "Delete project" action — only for cloud projects */
  projectType?: 'local' | 'cloud';
  onDeleteProject?: () => void;
  /** Forwarded ref for outside-click detection in parent */
  ref?: (el: HTMLDivElement) => void;
}

/** Relative time from timestamp in ms */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const COLLAPSED_LIMIT = 5;

const CloseProjectItem: Component<{ onClick: () => void }> = (props) => (
  <button
    data-testid="project-chip-close-project"
    onClick={props.onClick}
    class={styles.closeProjectBtn}
  >
    <span class={styles.closeIcon}>✕</span>
    Close Project
  </button>
);

const DeleteProjectItem: Component<{ onClick: () => void }> = (props) => (
  <button
    data-testid="project-chip-delete-project"
    onClick={props.onClick}
    class={styles.deleteProjectBtn}
  >
    <span class={styles.deleteIcon}>🗑</span>
    Delete project
  </button>
);

const RecentProjectsDropdown: Component<RecentProjectsDropdownProps> = (props) => {
  const total = () => props.recentProjects.length;
  const visibleRows = () =>
    props.expanded() ? props.recentProjects : props.recentProjects.slice(0, COLLAPSED_LIMIT);
  const showMoreCount = () => total() - COLLAPSED_LIMIT;
  const hasRecent = () => total() > 0;

  return (
    <Show when={props.when()}>
      <Portal>
        <div
          data-testid="project-chip-dropdown"
          ref={props.ref}
          class={styles.dropdown}
          // inline-allowed: computed offset from getBoundingClientRect
          style={{ top: `${props.dropdownPos().top}px`, left: `${props.dropdownPos().left}px` }}
        >
          {/* State C: no recent projects — show Close Project (+ Delete for cloud) */}
          <Show
            when={hasRecent()}
            fallback={
              <>
                <CloseProjectItem onClick={props.onCloseProject} />
                <Show when={props.projectType === 'cloud' && props.onDeleteProject}>
                  <DeleteProjectItem onClick={props.onDeleteProject!} />
                </Show>
              </>
            }
          >
            {/* States A1/A2/B: has recent projects */}
            {/* Section header */}
            <div data-testid="project-chip-recent-header" class={styles.header}>
              Recent Projects
            </div>

            {/* List region — A1: overflow:hidden + 10 rows in DOM; A2: max-height 560px + scroll; B: natural */}
            <div class={props.expanded() ? styles.listRegionExpanded : styles.listRegion}>
              <For each={visibleRows()}>
                {(entry) => {
                  const isCurrent = () => entry.id === props.currentProjectId;
                  return (
                    <div
                      data-testid={`project-chip-row-${entry.id}`}
                      onClick={() => !isCurrent() && props.onOpenProject(entry.id)}
                      class={styles.row}
                      classList={{ [styles.current]: isCurrent() }}
                    >
                      {/* Thumbnail placeholder */}
                      <div
                        class={styles.thumbnail}
                        classList={{ [styles.currentThumb]: isCurrent() }}
                      >
                        {isCurrent() ? '◷' : '📁'}
                      </div>

                      {/* Name + time */}
                      <div class={styles.nameCol}>
                        <div
                          class={styles.projectName}
                          classList={{ [styles.currentName]: isCurrent() }}
                        >
                          {entry.name}
                        </div>
                        <div class={styles.projectTime}>
                          {relativeTime(entry.lastOpened)}
                        </div>
                      </div>

                      {/* CURRENT badge slot — always reserved (3rd grid column) */}
                      <div class={styles.badgeSlot}>
                        <Show when={isCurrent()}>
                          <span class={styles.currentBadge}>
                            Current
                          </span>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Show more / Show less — single button toggling label/icon
                (avoid <Show fallback> two-button instances; click would unmount → click-outside listener
                would see detached node and falsely close the dropdown — see spec §3.3) */}
            <Show when={total() > COLLAPSED_LIMIT}>
              <button
                data-testid="project-chip-show-more-toggle"
                onClick={() => props.setExpanded(!props.expanded())}
                class={styles.showMoreToggle}
                classList={{ [styles.expanded]: props.expanded() }}
              >
                <span class={styles.showMoreIcon}>{props.expanded() ? '▴' : '⋯'}</span>
                {props.expanded() ? 'Show less' : `Show more (${showMoreCount()}) ↓`}
              </button>
            </Show>

            {/* Divider — fixed, outside scroll area */}
            <div data-testid="project-chip-divider" class={styles.divider} />

            {/* Close Project — fixed at bottom */}
            <CloseProjectItem onClick={props.onCloseProject} />

            {/* Delete Project — cloud projects only, same action group as Close */}
            <Show when={props.projectType === 'cloud' && props.onDeleteProject}>
              <DeleteProjectItem onClick={props.onDeleteProject!} />
            </Show>
          </Show>
        </div>
      </Portal>
    </Show>
  );
};

export { RecentProjectsDropdown };
