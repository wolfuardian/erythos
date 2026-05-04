import { type Component, createSignal, createEffect, onCleanup } from 'solid-js';
import { ConfirmDialog } from './ConfirmDialog';
import { RecentProjectsDropdown } from './RecentProjectsDropdown';
import { buildChipConfirmDialog, type ConfirmIntent } from './projectChipDialog';
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

function autosaveDotColor(status: 'idle' | 'pending' | 'saved' | 'error'): string {
  if (status === 'error') return 'var(--accent-red)';
  if (status === 'pending') return 'var(--accent-gold)';
  return 'var(--accent-green)'; // 'saved' | 'idle'
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
    const target = props.recentProjects.find((e) => e.id === id);
    const name = target?.name ?? id;
    setOpen(false);
    setExpanded(false);
    setConfirmIntent({ kind: 'open', id, name });
    setConfirmOpen(true);
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

  const dialog = () => buildChipConfirmDialog(confirmIntent(), props.autosaveStatus);

  return (
    <>
      <button
        data-testid="project-chip"
        ref={chipRef}
        onClick={handleChipClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`Autosave: ${props.autosaveStatus}`}
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          gap: '6px',
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
          'min-width': '100px',
          'max-width': '180px',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
        }}
      >
        <span
          data-testid="project-chip-autosave-dot"
          style={{
            display: 'inline-block',
            width: '5px',
            height: '5px',
            'border-radius': '50%',
            background: autosaveDotColor(props.autosaveStatus),
            'flex-shrink': '0',
          }}
        />
        <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
          {props.projectName}
        </span>
        <span style={{ 'flex-shrink': '0' }}>▾</span>
      </button>

      <RecentProjectsDropdown
        when={open}
        recentProjects={props.recentProjects}
        currentProjectId={props.currentProjectId}
        expanded={expanded}
        setExpanded={setExpanded}
        dropdownPos={dropdownPos}
        onOpenProject={handleOpenProject}
        onCloseProject={handleCloseProject}
        ref={(el) => (dropdownRef = el)}
      />

      <ConfirmDialog
        open={confirmOpen()}
        title={dialog().title}
        message={dialog().message}
        confirmLabel={dialog().confirm}
        cancelLabel="Cancel"
        variant={dialog().variant}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};

export { ProjectChip };
