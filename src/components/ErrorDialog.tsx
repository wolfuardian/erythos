import { type Component, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './ErrorDialog.module.css';

export interface ErrorDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

const ErrorDialog: Component<ErrorDialogProps> = (props) => {
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
      <div
        data-testid="error-dialog"
        class={styles.overlay}
        onClick={props.onClose}
      >
        <div
          class={styles.dialog}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 data-testid="error-dialog-title" class={styles.title}>
            {props.title}
          </h3>
          <p data-testid="error-dialog-message" class={styles.message}>
            {props.message}
          </p>
          <div data-testid="error-dialog-actions" class={styles.actions}>
            <button
              data-testid="error-dialog-close"
              class={styles.closeButton}
              onClick={props.onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
      </Portal>
    </Show>
  );
};

export { ErrorDialog };
