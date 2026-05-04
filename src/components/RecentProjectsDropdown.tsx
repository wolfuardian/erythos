import { type Component, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';

interface RecentProjectsDropdownProps {
  when: () => boolean;
  recentProjects: ProjectEntry[];
  currentProjectId: string | null;
  expanded: () => boolean;
  setExpanded: (v: boolean) => void;
  dropdownPos: () => { top: number; left: number };
  onOpenProject: (id: string) => void;
  onCloseProject: () => void;
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
    style={{
      padding: '6px 10px',
      'font-size': 'var(--font-size-sm)',
      color: '#e07070',
      cursor: 'pointer',
      display: 'flex',
      'align-items': 'center',
      gap: '7px',
      background: 'transparent',
      border: 'none',
      width: '100%',
      'text-align': 'left',
      'font-family': 'inherit',
      transition: 'background var(--transition-fast)',
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#2a1a1a'; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
  >
    <span style={{ 'font-size': '9px', width: '12px', 'text-align': 'center', 'flex-shrink': '0' }}>✕</span>
    Close Project
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
          style={{
            position: 'fixed',
            top: `${props.dropdownPos().top}px`,
            left: `${props.dropdownPos().left}px`,
            'z-index': '900',
            width: '300px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-medium)',
            'border-radius': 'var(--radius-md)',
            'box-shadow': 'var(--shadow-well-outer)',
            overflow: 'hidden',
            display: 'flex',
            'flex-direction': 'column',
          }}
        >
          {/* State C: no recent projects — show only Close Project */}
          <Show
            when={hasRecent()}
            fallback={
              <CloseProjectItem onClick={props.onCloseProject} />
            }
          >
            {/* States A1/A2/B: has recent projects */}
            {/* Section header */}
            <div data-testid="project-chip-recent-header" style={{
              padding: '6px 10px 4px',
              'font-size': 'var(--font-size-xs)',
              'font-family': 'var(--font-mono)',
              color: 'var(--text-muted)',
              'letter-spacing': '0.6px',
              'text-transform': 'uppercase',
              background: 'var(--bg-subheader)',
              'border-bottom': '1px solid var(--border-subtle)',
              'flex-shrink': '0',
            }}>
              Recent Projects
            </div>

            {/* List region — A1: overflow:hidden + 10 rows in DOM; A2: max-height 560px + scroll; B: natural */}
            <div style={{
              'overflow-y': props.expanded() ? 'auto' : 'hidden',
              'max-height': props.expanded() ? '560px' : undefined,
              // Custom scrollbar
              ...(props.expanded() ? {
                'scrollbar-width': 'thin',
                'scrollbar-color': '#2d3148 transparent',
              } : {}),
            }}>
              <For each={visibleRows()}>
                {(entry) => {
                  const isCurrent = () => entry.id === props.currentProjectId;
                  return (
                    <div
                      data-testid={`project-chip-row-${entry.id}`}
                      onClick={() => !isCurrent() && props.onOpenProject(entry.id)}
                      style={{
                        display: 'grid',
                        'grid-template-columns': '24px 1fr 100px',
                        'align-items': 'center',
                        gap: '8px',
                        padding: '4px 10px',
                        cursor: isCurrent() ? 'default' : 'pointer',
                        'min-height': '28px',
                        'border-bottom': '1px solid var(--border-subtle)',
                        background: isCurrent() ? 'rgba(82,127,200,0.08)' : 'transparent',
                        'border-left': isCurrent() ? '2px solid var(--accent-blue)' : undefined,
                        'padding-left': isCurrent() ? '8px' : '10px', // compensate border
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent()) {
                          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                        } else {
                          (e.currentTarget as HTMLElement).style.background = 'rgba(82,127,200,0.12)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent()) {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        } else {
                          (e.currentTarget as HTMLElement).style.background = 'rgba(82,127,200,0.08)';
                        }
                      }}
                    >
                      {/* Thumbnail placeholder */}
                      <div style={{
                        width: '24px',
                        height: '24px',
                        background: isCurrent() ? 'rgba(82,127,200,0.15)' : 'var(--bg-section)',
                        border: isCurrent() ? '1px solid rgba(82,127,200,0.3)' : '1px solid var(--border-subtle)',
                        'border-radius': 'var(--radius-sm)',
                        'flex-shrink': '0',
                        display: 'flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        'font-size': '11px',
                        color: isCurrent() ? 'var(--accent-blue)' : 'var(--text-muted)',
                      }}>
                        {isCurrent() ? '◷' : '📁'}
                      </div>

                      {/* Name + time */}
                      <div style={{
                        'min-width': '0',
                        display: 'flex',
                        'flex-direction': 'column',
                        gap: '1px',
                      }}>
                        <div style={{
                          'font-size': 'var(--font-size-sm)',
                          color: isCurrent() ? 'var(--text-primary)' : 'var(--text-secondary)',
                          overflow: 'hidden',
                          'text-overflow': 'ellipsis',
                          'white-space': 'nowrap',
                        }}>
                          {entry.name}
                        </div>
                        <div style={{
                          'font-size': 'var(--font-size-xs)',
                          color: 'var(--text-muted)',
                        }}>
                          {relativeTime(entry.lastOpened)}
                        </div>
                      </div>

                      {/* CURRENT badge slot — always reserved (3rd grid column) */}
                      <div style={{
                        display: 'flex',
                        'justify-content': 'flex-end',
                        'align-items': 'center',
                      }}>
                        <Show when={isCurrent()}>
                          <span style={{
                            'font-size': '7px',
                            'font-family': 'var(--font-mono)',
                            'font-weight': '600',
                            color: 'var(--accent-blue)',
                            background: 'rgba(82,127,200,0.15)',
                            border: '1px solid rgba(82,127,200,0.35)',
                            'border-radius': '2px',
                            padding: '1px 4px',
                            'letter-spacing': '0.4px',
                            'text-transform': 'uppercase',
                          }}>
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
                style={{
                  padding: '5px 10px',
                  'font-size': 'var(--font-size-xs)',
                  color: props.expanded() ? 'var(--text-muted)' : 'var(--accent-blue)',
                  cursor: 'pointer',
                  display: 'flex',
                  'align-items': 'center',
                  gap: '5px',
                  border: 'none',
                  background: 'transparent',
                  width: '100%',
                  'text-align': 'left',
                  'font-family': 'inherit',
                  transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ 'font-size': '9px' }}>{props.expanded() ? '▴' : '⋯'}</span>
                {props.expanded() ? 'Show less' : `Show more (${showMoreCount()}) ↓`}
              </button>
            </Show>

            {/* Divider — fixed, outside scroll area */}
            <div data-testid="project-chip-divider" style={{
              height: '1px',
              background: 'var(--border-medium)',
              'flex-shrink': '0',
            }} />

            {/* Close Project — fixed at bottom */}
            <CloseProjectItem onClick={props.onCloseProject} />
          </Show>
        </div>
      </Portal>
    </Show>
  );
};

export { RecentProjectsDropdown };
