import { For, type Component } from 'solid-js';
import { store, mutate, addWorkspace } from '../workspaceStore';
import { WorkspaceTab } from './WorkspaceTab';

export const WorkspaceTabBar: Component = () => {
  return (
    <div
      style={{
        display: 'flex',
        height: 'var(--workspace-tab-height, 32px)',
        background: 'var(--bg-header)',
        'border-bottom': '1px solid var(--border-subtle)',
        'align-items': 'center',
        'flex-shrink': 0,
      }}
    >
      <For each={store().workspaces}>
        {(w) => <WorkspaceTab workspace={w} />}
      </For>
      <button
        onClick={() => mutate(s => addWorkspace(s))}
        style={{
          padding: '0 var(--space-md)',
          height: '100%',
          background: 'transparent',
          color: 'var(--text-muted)',
          border: 'none',
          cursor: 'pointer',
          'font-size': 'var(--font-size-md)',
          'user-select': 'none',
        }}
        title="Duplicate current workspace"
      >
        +
      </button>
    </div>
  );
};
