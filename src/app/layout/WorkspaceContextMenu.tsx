import { type Component, Show, onMount, onCleanup } from 'solid-js';
import {
  store,
  mutate,
  deleteWorkspace,
  duplicateWorkspace,
  resetWorkspaceToPreset,
  isPresetId,
} from '../workspaceStore';

interface Props {
  workspaceId: string;
  x: number;
  y: number;
  onClose: () => void;
}

export const WorkspaceContextMenu: Component<Props> = (props) => {
  const canDelete = () => store().workspaces.length > 1;
  const canReset = () => isPresetId(props.workspaceId);

  const handle = (action: () => void) => {
    action();
    props.onClose();
  };

  onMount(() => {
    const close = () => props.onClose();
    window.addEventListener('click', close);
    onCleanup(() => window.removeEventListener('click', close));
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: `${props.y}px`,
        left: `${props.x}px`,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
        'z-index': '1000',
        'min-width': '160px',
        'border-radius': '4px',
        overflow: 'hidden',
      }}
    >
      <MenuItem
        label="Duplicate"
        onClick={() =>
          handle(() => mutate(s => duplicateWorkspace(s, props.workspaceId)))
        }
      />
      <Show when={canReset()}>
        <MenuItem
          label="Reset to default"
          onClick={() =>
            handle(() => mutate(s => resetWorkspaceToPreset(s, props.workspaceId)))
          }
        />
      </Show>
      <MenuItem
        label="Delete"
        disabled={!canDelete()}
        onClick={() =>
          handle(() => mutate(s => deleteWorkspace(s, props.workspaceId)))
        }
      />
    </div>
  );
};

const MenuItem: Component<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = (p) => (
  <div
    onClick={() => !p.disabled && p.onClick()}
    style={{
      padding: 'var(--space-sm) var(--space-md)',
      cursor: p.disabled ? 'default' : 'pointer',
      color: p.disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
      'user-select': 'none',
    }}
    onMouseEnter={(e) => {
      if (!p.disabled) {
        (e.currentTarget as HTMLDivElement).style.background =
          'var(--bg-hover, rgba(255,255,255,0.06))';
      }
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.background = '';
    }}
  >
    {p.label}
  </div>
);
