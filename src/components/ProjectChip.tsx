import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  projectName: string;
  autosaveStatus: 'idle' | 'pending' | 'saved' | 'error';
  onCloseProject: () => void;
}

const ProjectChip: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [dropdownPos, setDropdownPos] = createSignal<{ top: number; left: number }>({ top: 0, left: 0 });

  let chipRef: HTMLButtonElement | undefined;

  // Esc closes dropdown (only when dialog is not open)
  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmOpen()) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // Click-outside closes dropdown
  createEffect(() => {
    if (!open()) return;
    // Defer to next microtask so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      const onDocClick = (e: MouseEvent) => {
        if (chipRef && chipRef.contains(e.target as Node)) return;
        setOpen(false);
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
    setOpen((v) => !v);
  };

  const handleCloseProject = () => {
    setOpen(false);
    if (props.autosaveStatus === 'error') {
      setConfirmOpen(true);
    } else {
      props.onCloseProject();
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
        <span style={{ 'flex-shrink': 0 }}>▾</span>
      </button>

      <Show when={open()}>
        <Portal>
          <div
            data-devid="project-chip-dropdown"
            style={{
              position: 'fixed',
              top: `${dropdownPos().top}px`,
              left: `${dropdownPos().left}px`,
              'z-index': '900',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              'border-radius': 'var(--radius-sm)',
              'box-shadow': 'var(--shadow-well-outer)',
              'min-width': '160px',
              padding: '4px 0',
            }}
          >
            <DropdownItem label="Close Project" onClick={handleCloseProject} />
          </div>
        </Portal>
      </Show>

      <ConfirmDialog
        open={confirmOpen()}
        title="Save Failed — Close Anyway?"
        message="Recent changes could not be saved. Closing now will lose them."
        confirmLabel="Close Anyway"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmOpen(false);
          props.onCloseProject();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};

const DropdownItem: Component<{ label: string; onClick: () => void }> = (props) => {
  const [hovered, setHovered] = createSignal(false);
  return (
    <button
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        padding: '4px 12px',
        background: hovered() ? 'var(--bg-hover)' : 'transparent',
        color: 'var(--text-secondary)',
        border: 'none',
        'text-align': 'left',
        'font-size': 'var(--font-size-sm)',
        cursor: 'pointer',
        transition: 'background var(--transition-fast)',
      }}
    >
      {props.label}
    </button>
  );
};

export { ProjectChip };
