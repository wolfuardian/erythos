import { type Component, Show, onMount, onCleanup } from 'solid-js';
import {
  store,
  mutate,
  deleteWorkspace,
  duplicateWorkspace,
  resetWorkspaceToPreset,
  isPresetId,
} from '../workspaceStore';
import styles from './WorkspaceContextMenu.module.css';

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
      class={styles.menu}
      // inline-allowed: offset derived from mouse event clientX/Y at runtime
      style={{ top: `${props.y}px`, left: `${props.x}px` }}
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
    class={styles.menuItem}
    classList={{ [styles.disabled]: !!p.disabled }}
  >
    {p.label}
  </div>
);
