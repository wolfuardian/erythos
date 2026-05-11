import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { User } from '../core/auth/AuthClient';
import styles from './DeleteAccountDialog.module.css';

export interface DeleteAccountDialogProps {
  open: boolean;
  user: User;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

const DeleteAccountDialog: Component<DeleteAccountDialogProps> = (props) => {
  const [input, setInput] = createSignal('');
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Reset state when dialog opens/closes
  createEffect(() => {
    if (!props.open) {
      setInput('');
      setDeleting(false);
      setError(null);
    }
  });

  // Close on Escape key — bound only while dialog is open
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting()) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const isConfirmed = () => input() === props.user.githubLogin;

  const handleDelete = async () => {
    if (!isConfirmed() || deleting()) return;
    setDeleting(true);
    setError(null);
    try {
      await props.onConfirm();
      // Server cleared cookie; reload redirects to guest view
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="delete-account-dialog"
          class={styles.overlay}
          onClick={(e) => {
            // Clicking the backdrop closes if not mid-delete
            if (e.target === e.currentTarget && !deleting()) props.onClose();
          }}
        >
          <div
            class={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class={styles.title}>Delete account</h3>
            <p class={styles.warning}>
              This will permanently delete your account, scenes, and revision history.
              This cannot be undone.
            </p>

            <label class={styles.confirmLabel}>
              Type your GitHub username (
              <span class={styles.confirmLogin}>{props.user.githubLogin}</span>
              ) to confirm:
              <input
                data-testid="delete-account-confirm-input"
                type="text"
                class={styles.confirmInput}
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                disabled={deleting()}
                autocomplete="off"
                spellcheck={false}
              />
            </label>

            <Show when={error() !== null}>
              <p
                data-testid="delete-account-error"
                class={styles.error}
              >
                {error()}
              </p>
            </Show>

            <div class={styles.actions}>
              <button
                data-testid="delete-account-cancel"
                type="button"
                class={`${styles.button} ${styles.cancelButton}`}
                disabled={deleting()}
                onClick={props.onClose}
              >
                Cancel
              </button>
              <button
                data-testid="delete-account-confirm"
                type="button"
                class={`${styles.button} ${styles.deleteButton}`}
                disabled={!isConfirmed() || deleting()}
                onClick={() => void handleDelete()}
              >
                {deleting() ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { DeleteAccountDialog };
