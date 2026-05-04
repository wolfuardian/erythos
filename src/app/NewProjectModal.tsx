import { type Component, createSignal, Show } from 'solid-js';
import { ProjectManager } from '../core/project/ProjectManager';
import styles from './NewProjectModal.module.css';

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
        class={styles.overlay}
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div class={styles.dialog}>
          {/* Modal title */}
          <div data-testid="new-project-modal-title" class={styles.title}>
            Create New Project
          </div>

          {/* Pick location */}
          <div data-testid="new-project-modal-parent-field" class={styles.field}>
            <label class={styles.label}>Parent Location</label>
            <button
              data-testid="new-project-modal-parent-picker"
              class={styles.pickerButton}
              classList={{ [styles.hasValue]: !!parentHandle() }}
              onClick={() => void handlePickLocation()}
            >
              {parentHandle() ? parentHandle()!.name : 'Pick parent folder…'}
            </button>
          </div>

          {/* Project name */}
          <div data-testid="new-project-modal-name-field" class={styles.field}>
            <label class={styles.label}>Project Name</label>
            <input
              data-testid="new-project-modal-name-input"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              placeholder="my-project"
              class={styles.input}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') closeModal(); }}
            />
          </div>

          {/* Final Path preview */}
          <div data-testid="new-project-modal-path-field" class={styles.field}>
            <label class={styles.label}>Final Path</label>
            <div
              data-testid="new-project-modal-path-preview"
              title={finalPath() ?? undefined}
              class={styles.pathPreview}
              classList={{ [styles.hasValue]: !!finalPath() }}
            >
              {finalPath() ?? 'Pick parent location to preview path'}
            </div>
          </div>

          {/* Modal error */}
          <Show when={errorMsg()}>
            <div data-testid="new-project-modal-error" class={styles.errorMsg}>
              {errorMsg()}
            </div>
          </Show>

          {/* Actions */}
          <div data-testid="new-project-modal-actions" class={styles.actions}>
            <button
              data-testid="new-project-modal-cancel"
              class={styles.cancelButton}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button
              data-testid="new-project-modal-create"
              class={styles.createButton}
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
