import { type Component, For, createSignal } from 'solid-js';
import { BrandMark } from './BrandMark';
import { ProjectChip } from './ProjectChip';
import { useEditor } from '../app/EditorContext';
import { clearSavedLayout } from '../app/workspaceStore';
import { store, mutate, addWorkspace } from '../app/workspaceStore';
import { WorkspaceTab } from '../app/layout/WorkspaceTab';

export const Toolbar: Component = () => {
  const bridge = useEditor();
  const tabRefs = new Map<string, HTMLElement>();

  const [resetHovered, setResetHovered] = createSignal(false);

  return (
    <div
      data-testid="toolbar"
      style={{
        height: '30px',
        background: 'var(--bg-header)',
        'border-bottom': '1px solid var(--border-subtle)',
        display: 'flex',
        'align-items': 'center',
        overflow: 'hidden',
        'flex-shrink': '0',
        'padding-left': '8px',
      }}
    >
      {/* Brand mark */}
      <div
        data-testid="toolbar-brand-mark"
        style={{ display: 'flex', 'align-items': 'center', 'flex-shrink': '0' }}
      >
        <BrandMark appVersion={__APP_VERSION__} />
      </div>

      {/* Project section */}
      <div
        data-testid="toolbar-project"
        style={{ display: 'flex', 'align-items': 'center', padding: '0 7px', 'flex-shrink': '0' }}
      >
        <ProjectChip
          projectName={bridge.projectName() ?? ''}
          autosaveStatus={bridge.autosaveStatus()}
          onCloseProject={bridge.closeProject}
          recentProjects={bridge.recentProjects()}
          currentProjectId={bridge.currentProjectId()}
          onOpenProject={bridge.openProjectById}
        />
      </div>

      {/* Spacer */}
      <div style={{ flex: '1', 'min-width': '0' }} />

      {/* Workspace tabs area */}
      <div
        data-testid="toolbar-workspace-tabs"
        style={{
          display: 'flex',
          'align-items': 'center',
          padding: '0 4px',
          gap: '2px',
          'overflow-x': 'auto',
          'scrollbar-width': 'none',
          'flex-shrink': '1',
          'min-width': '0',
        }}
      >
        <For each={store().workspaces}>
          {(w) => (
            <WorkspaceTab
              workspace={w}
              ref={(el) => tabRefs.set(w.id, el)}
              tabRefs={tabRefs}
            />
          )}
        </For>

        {/* Ghost "+" button */}
        <button
          type="button"
          onClick={() => mutate(s => addWorkspace(s))}
          title="Duplicate current workspace"
          style={{
            width: '18px',
            height: '18px',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '11px',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-medium)',
            'border-radius': 'var(--radius-md)',
            cursor: 'pointer',
            'margin-left': '2px',
            'flex-shrink': '0',
            'line-height': '1',
            background: 'transparent',
            transition: 'color var(--transition-fast), border-color var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-medium)';
          }}
        >
          +
        </button>
      </div>

      {/* Split divider */}
      <div style={{
        width: '1px',
        height: '16px',
        background: 'var(--border-medium)',
        margin: '0 5px',
        'align-self': 'center',
        'flex-shrink': '0',
      }} />

      {/* Reset Layout icon button */}
      <button
        data-testid="toolbar-reset-layout"
        onClick={() => { clearSavedLayout(); location.reload(); }}
        title="Reset panel layout to default"
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'font-size': '13px',
          padding: '0 8px',
          background: 'transparent',
          color: resetHovered() ? 'var(--text-secondary)' : 'var(--text-muted)',
          border: 'none',
          cursor: 'pointer',
          'flex-shrink': '0',
          transition: 'color var(--transition-fast)',
        }}
        onMouseEnter={() => setResetHovered(true)}
        onMouseLeave={() => setResetHovered(false)}
      >
        ↺
      </button>
    </div>
  );
};
