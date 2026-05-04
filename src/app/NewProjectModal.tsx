import { type Component, createSignal, Show } from 'solid-js';
import { ProjectManager } from '../core/project/ProjectManager';

// Session-scoped memory for last picked Parent Location (cleared on page reload)
let lastPickedParent: FileSystemDirectoryHandle | null = null;

interface NewProjectModalProps {
  show: () => boolean;
  onClose: () => void;
  projectManager: ProjectManager;
  onOpenProject: (handle: FileSystemDirectoryHandle) => Promise<void>;
  onAfterCreate?: () => void;
}

export const NewProjectModal: Component<NewProjectModalProps> = (props) => {
  const [newName, setNewName] = createSignal('');
  const [parentHandle, setParentHandle] = createSignal<FileSystemDirectoryHandle | null>(lastPickedParent);
  const [errorMsg, setErrorMsg] = createSignal('');

  const handlePickLocation = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      lastPickedParent = handle;
      setParentHandle(handle);
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || String(e));
    }
  };

  const handleCreate = async () => {
    const parent = parentHandle();
    if (!parent || !newName().trim()) return;
    try {
      await props.projectManager.createProject(newName().trim(), parent);
      props.onAfterCreate?.();
      const list = await props.projectManager.getRecentProjects();
      const fresh = list.find(e => e.name === newName().trim());
      if (fresh?.handle) await props.onOpenProject(fresh.handle);
      props.onClose();
      setNewName('');
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const closeModal = () => {
    props.onClose();
    setNewName('');
    setErrorMsg('');
  };

  // Final path preview — shows <parent.name>/<projectName> assemblage
  const finalPath = (): string | null => {
    const parent = parentHandle();
    if (!parent) return null;
    const name = newName().trim();
    return name ? `${parent.name}/${name}` : `${parent.name}/...`;
  };

  return (
    <Show when={props.show()}>
      <div
        data-testid="new-project-modal"
        style={{
          position: 'fixed',
          inset: '0',
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': '1000',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-medium)',
          'border-radius': 'var(--radius-lg)',
          'box-shadow': 'var(--shadow-popup)',
          padding: 'var(--space-2xl)',
          width: '360px',
          display: 'flex',
          'flex-direction': 'column',
          gap: 'var(--space-xl)',
        }}>
          {/* Modal title */}
          <div data-testid="new-project-modal-title" style={{
            'font-size': 'var(--font-size-xl)',
            'font-weight': '600',
            color: 'var(--text-primary)',
          }}>
            Create New Project
          </div>

          {/* Pick location */}
          <div data-testid="new-project-modal-parent-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
            <label style={{
              'font-size': 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              'text-transform': 'uppercase' as const,
              'letter-spacing': '0.6px',
              'font-weight': '600',
            }}>
              Parent Location
            </label>
            <button
              data-testid="new-project-modal-parent-picker"
              style={{
                background: 'var(--bg-section)',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-md)',
                padding: 'var(--space-md) var(--space-lg)',
                color: parentHandle() ? 'var(--text-primary)' : 'var(--text-muted)',
                'font-size': 'var(--font-size-md)',
                cursor: 'pointer',
                'text-align': 'left' as const,
                'font-family': parentHandle() ? 'var(--font-mono)' : 'inherit',
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
              }}
              onClick={() => void handlePickLocation()}
            >
              {parentHandle() ? parentHandle()!.name : 'Pick parent folder…'}
            </button>
          </div>

          {/* Project name */}
          <div data-testid="new-project-modal-name-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
            <label style={{
              'font-size': 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              'text-transform': 'uppercase' as const,
              'letter-spacing': '0.6px',
              'font-weight': '600',
            }}>
              Project Name
            </label>
            <input
              data-testid="new-project-modal-name-input"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              placeholder="my-project"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-md)',
                padding: 'var(--space-md) var(--space-lg)',
                color: 'var(--text-primary)',
                'font-size': 'var(--font-size-md)',
                'box-shadow': 'var(--shadow-input-inset)',
                outline: 'none',
                width: '100%',
                'box-sizing': 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.outline = '1px solid var(--accent-gold)'; }}
              onBlur={(e) => { e.currentTarget.style.outline = 'none'; }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') closeModal(); }}
            />
          </div>

          {/* Final Path preview */}
          <div data-testid="new-project-modal-path-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
            <label style={{
              'font-size': 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              'text-transform': 'uppercase' as const,
              'letter-spacing': '0.6px',
              'font-weight': '600',
            }}>
              Final Path
            </label>
            <div
              data-testid="new-project-modal-path-preview"
              title={finalPath() ?? undefined}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-md)',
                padding: 'var(--space-md) var(--space-lg)',
                'font-size': 'var(--font-size-sm)',
                'font-family': finalPath() ? 'var(--font-mono)' : 'inherit',
                'font-style': finalPath() ? 'normal' : 'italic',
                color: finalPath() ? 'var(--text-secondary)' : 'var(--text-muted)',
                'box-shadow': 'var(--shadow-input-inset)',
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
              }}
            >
              {finalPath() ?? 'Pick parent location to preview path'}
            </div>
          </div>

          {/* Modal error */}
          <Show when={errorMsg()}>
            <div data-testid="new-project-modal-error" style={{
              'font-size': 'var(--font-size-xs)',
              color: 'var(--accent-red)',
            }}>
              {errorMsg()}
            </div>
          </Show>

          {/* Actions */}
          <div data-testid="new-project-modal-actions" style={{
            display: 'flex',
            gap: 'var(--space-md)',
            'justify-content': 'flex-end',
          }}>
            <button
              data-testid="new-project-modal-cancel"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-md)',
                padding: 'var(--space-md) var(--space-xl)',
                color: 'var(--text-secondary)',
                'font-size': 'var(--font-size-md)',
                cursor: 'pointer',
              }}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button
              data-testid="new-project-modal-create"
              style={{
                background: (!parentHandle() || !newName().trim()) ? 'var(--bg-section)' : 'var(--accent-blue)',
                border: '1px solid transparent',
                'border-radius': 'var(--radius-md)',
                padding: 'var(--space-md) var(--space-xl)',
                color: (!parentHandle() || !newName().trim()) ? 'var(--text-muted)' : 'var(--text-primary)',
                'font-size': 'var(--font-size-md)',
                cursor: (!parentHandle() || !newName().trim()) ? 'default' : 'pointer',
              }}
              disabled={!parentHandle() || !newName().trim()}
              onClick={() => void handleCreate()}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
