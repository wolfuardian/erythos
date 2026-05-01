import { type Component } from 'solid-js';
import { ProjectChip } from './ProjectChip';
import { useEditor } from '../app/EditorContext';
import { clearSavedLayout } from '../app/workspaceStore';

export const Toolbar: Component = () => {
  const bridge = useEditor();

  return (
    <div
      data-devid="toolbar"
      style={{
        height: 'var(--toolbar-height)',
        background: 'var(--bg-header)',
        'border-bottom': '1px solid var(--border-subtle)',
        display: 'flex',
        'align-items': 'center',
        padding: '0 var(--space-md)',
        gap: 'var(--space-sm)',
      }}
    >
      {/* Brand */}
      <span style={{
        color: 'var(--accent-blue)',
        'font-weight': 'bold',
        'font-size': 'var(--font-size-lg)',
        'margin-right': 'var(--space-md)',
      }}>
        Erythos
      </span>

      <ProjectChip
        projectName={bridge.projectName() ?? ''}
        autosaveStatus={bridge.autosaveStatus()}
        onCloseProject={bridge.closeProject}
        recentProjects={bridge.recentProjects()}
        currentProjectId={bridge.currentProjectId()}
        onOpenProject={bridge.openProjectById}
      />

      {/* Divider before Reset Layout */}
      <div style={{
        width: '1px',
        height: '18px',
        background: 'var(--border-medium)',
        margin: '0 var(--space-xs)',
      }} />

      {/* Reset Layout — inline button, no shared ToolbarBtn */}
      <button
        onClick={() => { clearSavedLayout(); location.reload(); }}
        title="Reset panel layout to default"
        style={{
          padding: '2px 8px',
          height: '24px',
          background: 'var(--bg-section)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          'border-radius': 'var(--radius-sm)',
          'font-size': 'var(--font-size-sm)',
          cursor: 'pointer',
          transition: 'background var(--transition-fast)',
        }}
      >
        Reset Layout
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      <span style={{ color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)' }}>
        v{__APP_VERSION__}
      </span>
    </div>
  );
};
