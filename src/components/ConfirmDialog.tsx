import { type Component, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' uses --accent-red for destructive actions; defaults to 'default' (blue) */
  variant?: 'default' | 'danger';
}

const ConfirmDialog: Component<ConfirmDialogProps> = (props) => {
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
      <div
        data-testid="confirm-dialog"
        class={styles.overlay}
        onClick={props.onCancel}
      >
        <div
          class={styles.dialog}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 data-testid="confirm-dialog-title" class={styles.title}>
            {props.title}
          </h3>
          <p data-testid="confirm-dialog-message" class={styles.message}>
            {props.message}
          </p>
          <div data-testid="confirm-dialog-actions" class={styles.actions}>
            <button
              data-testid="confirm-dialog-cancel"
              class={styles.button}
              classList={{ [styles.cancelButton]: true }}
              onClick={props.onCancel}
            >
              {props.cancelLabel ?? 'Cancel'}
            </button>
            <button
              data-testid="confirm-dialog-confirm"
              class={styles.button}
              classList={{ [styles.confirmButton]: true, [styles.danger]: props.variant === 'danger' }}
              onClick={props.onConfirm}
            >
              {props.confirmLabel ?? 'OK'}
            </button>
          </div>
        </div>
      </div>
      </Portal>
    </Show>
  );
};

export { ConfirmDialog };
