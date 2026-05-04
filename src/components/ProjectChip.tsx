import { type Component, createSignal, createEffect, onCleanup } from 'solid-js';
import { ConfirmDialog } from './ConfirmDialog';
import { RecentProjectsDropdown } from './RecentProjectsDropdown';
import { buildChipConfirmDialog, type ConfirmIntent } from './projectChipDialog';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';
import styles from './ProjectChip.module.css';

interface Props {
  projectName: string;
  autosaveStatus: 'idle' | 'pending' | 'saved' | 'error';
  onCloseProject: () => void;
  // v2 new props
  recentProjects: ProjectEntry[];
  currentProjectId: string | null;
  onOpenProject: (id: string) => Promise<void>;
}

const ProjectChip: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
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

  const dialog = () => buildChipConfirmDialog(confirmIntent(), props.autosaveStatus);

  return (
    <>
      <button
        data-testid="project-chip"
        ref={chipRef}
        onClick={handleChipClick}
        title={`Autosave: ${props.autosaveStatus}`}
        class={styles.chip}
        classList={{ [styles.open]: open() }}
      >
        <span
          data-testid="project-chip-autosave-dot"
          class={styles.dot}
          classList={{
            [styles.dotIdle]: props.autosaveStatus === 'idle',
            [styles.dotSaved]: props.autosaveStatus === 'saved',
            [styles.dotPending]: props.autosaveStatus === 'pending',
            [styles.dotError]: props.autosaveStatus === 'error',
          }}
        />
        <span class={styles.name}>
          {props.projectName}
        </span>
        <span class={styles.caret}>▾</span>
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
