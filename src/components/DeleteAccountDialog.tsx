import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { User } from '../core/auth/AuthClient';
import styles from './DeleteAccountDialog.module.css';

export interface DeleteAccountDialogProps {
  open: boolean;
  user: User;
  /** G1: called on confirm; resolves with scheduled deletion timestamp (refs #1095). */
  onConfirm: () => Promise<{ scheduledDeleteAt: string }>;
  onClose: () => void;
  /** Optional ref to element that triggered the dialog; receives focus on close */
  triggerRef?: HTMLElement | null;
}

const TITLE_ID = 'delete-account-dialog-title';

const DeleteAccountDialog: Component<DeleteAccountDialogProps> = (props) => {
  const [input, setInput] = createSignal('');
  const [deleting, setDeleting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let cancelRef!: HTMLButtonElement;
  let dialogRef!: HTMLDivElement;

  // Reset state when dialog opens/closes
  createEffect(() => {
    if (!props.open) {
      setInput('');
      setDeleting(false);
      setError(null);
    }
  });

  // Autofocus cancel button when dialog opens
  createEffect(() => {
    if (props.open) {
      // Use requestAnimationFrame to ensure the Portal has rendered
      requestAnimationFrame(() => {
        cancelRef?.focus();
      });
    } else {
      // Return focus to trigger element on close
      props.triggerRef?.focus();
    }
  });

  // Close on Escape key — bound only while dialog is open
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting()) {
        props.onClose();
        return;
      }
      // Focus trap: Tab cycles within dialog
      if (e.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
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
      // Server cleared session cookie; reload redirects to guest view.
      // G1: account is now in 30-day grace period — user can sign back in during
      // this period and cancel via the banner. After 30 days the account is deleted.
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
            ref={dialogRef}
            class={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={TITLE_ID}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={TITLE_ID} class={styles.title}>Delete account</h3>
            <p class={styles.warning}>
              Your account will be scheduled for deletion in 30 days.
              You can cancel within this grace period by signing back in.
              After 30 days, your account, scenes, and revision history will be permanently deleted.
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
                role="alert"
                aria-live="assertive"
              >
                {error()}
              </p>
            </Show>

            <div class={styles.actions}>
              <button
                data-testid="delete-account-cancel"
                ref={cancelRef}
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
                {deleting() ? 'Scheduling…' : 'Schedule deletion'}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { DeleteAccountDialog };
