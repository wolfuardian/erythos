import { type Component, createSignal, Show } from 'solid-js';
import { LocalProjectManager } from '../core/project/LocalProjectManager';
import type { User } from '../core/auth/AuthClient';
import styles from './NewProjectModal.module.css';

// Session-scoped memory for last picked parent location (cleared on page reload).
// Typed via inference from pickDirectory() — no explicit FileSystemDirectoryHandle reference.
let _lastPickedParent: Awaited<ReturnType<LocalProjectManager['pickDirectory']>> = null;

/** Project type selection for new project dialog.
 * Default is 'local' per spec Q-A resolution — lower onboarding friction.
 */
type ProjectKind = 'local' | 'cloud';

interface NewProjectModalProps {
  show: () => boolean;
  onClose: () => void;
  projectManager: LocalProjectManager;
  /** Called after successful project creation. Receives the new project's id. */
  onOpenProject: (id: string) => Promise<void>;
  onAfterCreate?: () => void;
  /** Current user — when non-null, show Local/Cloud toggle. */
  currentUser?: () => User | null | undefined;
  /** Called to create a new cloud project with the given name. */
  onCreateCloudProject?: (name: string) => Promise<void>;
}

export const NewProjectModal: Component<NewProjectModalProps> = (props) => {
  const [newName, setNewName] = createSignal('');
  // Parent handle stored by inference — type follows LocalProjectManager.pickDirectory()
  const [parentHandle, setParentHandle] = createSignal(_lastPickedParent);
  const [errorMsg, setErrorMsg] = createSignal('');
  // Project kind: default 'local' per spec Q-A resolution (lower onboarding friction)
  const [projectKind, setProjectKind] = createSignal<ProjectKind>('local');

  // Whether the signed-in user can use cloud
  const canUseCloud = () => {
    const u = props.currentUser?.();
    return u != null && u !== undefined;
  };

  const handlePickLocation = async () => {
    try {
      const handle = await props.projectManager.pickDirectory();
      _lastPickedParent = handle;
      setParentHandle(handle);
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || String(e));
    }
  };

  const handleCreate = async () => {
    if (!newName().trim()) return;

    if (projectKind() === 'cloud' && props.onCreateCloudProject) {
      // Cloud path — no parent directory needed
      try {
        await props.onCreateCloudProject(newName().trim());
        props.onAfterCreate?.();
        props.onClose();
        setNewName('');
      } catch (e: any) {
        setErrorMsg(e.message || String(e));
      }
      return;
    }

    // Local path
    const parent = parentHandle();
    if (!parent) return;
    try {
      await props.projectManager.createProject(newName().trim(), parent);
      props.onAfterCreate?.();
      const list = await props.projectManager.getRecentProjects();
      const fresh = list.find(e => e.name === newName().trim());
      if (fresh?.id) await props.onOpenProject(fresh.id);
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
    setProjectKind('local');
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

          {/* Local / Cloud toggle — only shown when signed in */}
          <Show when={canUseCloud()}>
            <div data-testid="new-project-modal-kind-field" class={styles.field}>
              <label class={styles.label}>Project Type</label>
              <div data-testid="new-project-modal-kind-toggle" class={styles.kindToggle}>
                <button
                  data-testid="new-project-modal-kind-local"
                  class={styles.kindOption}
                  classList={{ [styles.kindActive]: projectKind() === 'local' }}
                  onClick={() => setProjectKind('local')}
                >
                  Local
                </button>
                <button
                  data-testid="new-project-modal-kind-cloud"
                  class={styles.kindOption}
                  classList={{ [styles.kindActive]: projectKind() === 'cloud' }}
                  onClick={() => setProjectKind('cloud')}
                >
                  Cloud
                </button>
              </div>
            </div>
          </Show>

          {/* Pick location — local only */}
          <Show when={projectKind() === 'local'}>
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
          </Show>

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

          {/* Final Path preview — local only */}
          <Show when={projectKind() === 'local'}>
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
          </Show>

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
              disabled={
                projectKind() === 'cloud'
                  ? !newName().trim()
                  : !parentHandle() || !newName().trim()
              }
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
