import { type Component, Show, For, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { ConfirmDialog } from './ConfirmDialog';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';

interface Props {
  projectName: string;
  autosaveStatus: 'idle' | 'pending' | 'saved' | 'error';
  onCloseProject: () => void;
  // v2 new props
  recentProjects: ProjectEntry[];
  currentProjectId: string | null;
  onOpenProject: (id: string) => Promise<void>;
}

/** Pending confirm intent — tracks what to do after user confirms */
type ConfirmIntent =
  | { kind: 'close' }
  | { kind: 'open'; id: string };

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

const ProjectChip: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [confirmIntent, setConfirmIntent] = createSignal<ConfirmIntent>({ kind: 'close' });
  const [expanded, setExpanded] = createSignal(false);
  const [dropdownPos, setDropdownPos] = createSignal<{ top: number; left: number }>({ top: 0, left: 0 });

  let chipRef: HTMLButtonElement | undefined;
  let dropdownRef: HTMLDivElement | undefined;

  // Esc closes dropdown (only when dialog is not open)
  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmOpen()) {
        setOpen(false);
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // Click-outside closes dropdown (checks both chip and dropdown portal)
  createEffect(() => {
    if (!open()) return;
    // Defer to next microtask so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      const onDocClick = (e: MouseEvent) => {
        if (chipRef && chipRef.contains(e.target as Node)) return;
        if (dropdownRef && dropdownRef.contains(e.target as Node)) return;
        setOpen(false);
        setExpanded(false);
      };
      document.addEventListener('click', onDocClick);
      onCleanup(() => document.removeEventListener('click', onDocClick));
    }, 0);
    onCleanup(() => clearTimeout(timer));
  });

  const handleChipClick = () => {
    if (!open() && chipRef) {
      const rect = chipRef.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left });
    }
    if (open()) {
      setExpanded(false);
    }
    setOpen((v) => !v);
  };

  const handleCloseProject = () => {
    setOpen(false);
    setExpanded(false);
    setConfirmIntent({ kind: 'close' });
    setConfirmOpen(true);
  };

  const handleOpenProject = (id: string) => {
    if (id === props.currentProjectId) return; // no-op for current
    if (props.autosaveStatus === 'error') {
      setOpen(false);
      setExpanded(false);
      setConfirmIntent({ kind: 'open', id });
      setConfirmOpen(true);
    } else {
      setOpen(false);
      setExpanded(false);
      void props.onOpenProject(id);
    }
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    const intent = confirmIntent();
    if (intent.kind === 'close') {
      props.onCloseProject();
    } else {
      void props.onOpenProject(intent.id);
    }
  };

  const chipBg = () => {
    if (open()) return 'var(--bg-hover)';
    if (hovered()) return 'var(--bg-hover)';
    return 'var(--bg-section)';
  };

  const chipBorder = () =>
    open()
      ? '1px solid var(--accent-blue)'
      : '1px solid var(--border-subtle)';

  // Derived: how many rows to render, show-more visibility
  const total = () => props.recentProjects.length;
  const visibleRows = () =>
    expanded() ? props.recentProjects : props.recentProjects.slice(0, 10);
  const showMoreCount = () => total() - 10;
  const hasRecent = () => total() > 0;

  // Confirm dialog copy — varies by autosave status (see spec §5.3)
  const dialogTitle = () =>
    props.autosaveStatus === 'error' ? 'Save Failed — Continue Anyway?' : 'Close project?';
  const dialogMessage = () =>
    props.autosaveStatus === 'error'
      ? 'Recent changes could not be saved. Continuing will lose them.'
      : 'The current project will be closed.';
  const dialogConfirm = () =>
    props.autosaveStatus === 'error' ? 'Continue Anyway' : 'Close';

  return (
    <>
      <button
        data-devid="project-chip"
        ref={chipRef}
        onClick={handleChipClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          gap: '4px',
          padding: '2px 8px',
          height: '24px',
          background: chipBg(),
          color: 'var(--text-secondary)',
          border: chipBorder(),
          'border-radius': 'var(--radius-sm)',
          'font-size': 'var(--font-size-sm)',
          cursor: 'pointer',
          transition: 'background var(--transition-fast), border-color var(--transition-fast)',
          'white-space': 'nowrap',
          'max-width': '180px',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
          {props.projectName}
        </span>
        <span style={{ 'flex-shrink': '0' }}>▾</span>
      </button>

      <Show when={open()}>
        <Portal>
          <div
            data-devid="project-chip-dropdown"
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: `${dropdownPos().top}px`,
              left: `${dropdownPos().left}px`,
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
                <CloseProjectItem onClick={handleCloseProject} />
              }
            >
              {/* States A1/A2/B: has recent projects */}
              {/* Section header */}
              <div style={{
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
                'overflow-y': expanded() ? 'auto' : 'hidden',
                'max-height': expanded() ? '560px' : undefined,
                // Custom scrollbar
                ...(expanded() ? {
                  'scrollbar-width': 'thin',
                  'scrollbar-color': '#2d3148 transparent',
                } : {}),
              }}>
                <For each={visibleRows()}>
                  {(entry) => {
                    const isCurrent = () => entry.id === props.currentProjectId;
                    return (
                      <div
                        onClick={() => !isCurrent() && handleOpenProject(entry.id)}
                        style={{
                          display: 'flex',
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
                          flex: '1',
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

                        {/* CURRENT badge */}
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
                            'flex-shrink': '0',
                          }}>
                            Current
                          </span>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>

              {/* Show more / Show less — only when total > 10 */}
              <Show when={total() > 10}>
                <Show
                  when={!expanded()}
                  fallback={
                    /* Show less button */
                    <button
                      onClick={() => setExpanded(false)}
                      style={{
                        padding: '5px 10px',
                        'font-size': 'var(--font-size-xs)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        'align-items': 'center',
                        gap: '5px',
                        border: 'none',
                        background: 'transparent',
                        width: '100%',
                        'text-align': 'left',
                        'font-family': 'inherit',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{ 'font-size': '9px' }}>▴</span>
                      Show less
                    </button>
                  }
                >
                  {/* Show more button */}
                  <button
                    onClick={() => setExpanded(true)}
                    style={{
                      padding: '5px 10px',
                      'font-size': 'var(--font-size-xs)',
                      color: 'var(--accent-blue)',
                      cursor: 'pointer',
                      display: 'flex',
                      'align-items': 'center',
                      gap: '5px',
                      border: 'none',
                      background: 'transparent',
                      width: '100%',
                      'text-align': 'left',
                      'font-family': 'inherit',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{ 'font-size': '9px' }}>⋯</span>
                    Show more ({showMoreCount()}) ↓
                  </button>
                </Show>
              </Show>

              {/* Divider — fixed, outside scroll area */}
              <div style={{
                height: '1px',
                background: 'var(--border-medium)',
                'flex-shrink': '0',
              }} />

              {/* Close Project — fixed at bottom */}
              <CloseProjectItem onClick={handleCloseProject} />
            </Show>
          </div>
        </Portal>
      </Show>

      <ConfirmDialog
        open={confirmOpen()}
        title={dialogTitle()}
        message={dialogMessage()}
        confirmLabel={dialogConfirm()}
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};

const CloseProjectItem: Component<{ onClick: () => void }> = (props) => (
  <button
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

export { ProjectChip };
