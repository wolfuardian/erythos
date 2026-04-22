import { type Component } from 'solid-js';
import { store, mutate, setCurrent } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

interface Props {
  workspace: Workspace;
}

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;

  return (
    <div
      onClick={() => mutate(s => setCurrent(s, props.workspace.id))}
      style={{
        padding: '0 var(--space-md)',
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        cursor: 'pointer',
        color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive() ? 'var(--bg-app)' : 'transparent',
        'border-bottom': isActive() ? '2px solid var(--accent-blue)' : '2px solid transparent',
        'user-select': 'none',
      }}
    >
      {props.workspace.name}
    </div>
  );
};
