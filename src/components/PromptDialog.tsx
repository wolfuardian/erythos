import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './PromptDialog.module.css';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const PromptDialog: Component<PromptDialogProps> = (props) => {
  const [value, setValue] = createSignal('');
  let inputRef!: HTMLInputElement;

  // Reset input value when dialog opens and focus it
  createEffect(() => {
    if (!props.open) return;
    setValue('');
    // Focus input on next tick after mount
    requestAnimationFrame(() => inputRef?.focus());
  });

  // ESC to cancel, Enter to confirm
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { props.onCancel(); }
      if (e.key === 'Enter' && value().trim()) { props.onConfirm(value().trim()); }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const handleConfirm = () => {
    const v = value().trim();
    if (!v) return;
    props.onConfirm(v);
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="prompt-dialog"
          class={styles.overlay}
          onClick={props.onCancel}
        >
          <div
            class={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 data-testid="prompt-dialog-title" class={styles.title}>
              {props.title}
            </h3>
            <Show when={props.message}>
              <p data-testid="prompt-dialog-message" class={styles.message}>
                {props.message}
              </p>
            </Show>
            <input
              data-testid="prompt-dialog-input"
              ref={inputRef}
              type="text"
              placeholder={props.placeholder ?? ''}
              value={value()}
              onInput={(e) => setValue(e.currentTarget.value)}
              class={styles.input}
            />
            <div data-testid="prompt-dialog-actions" class={styles.actions}>
              <button
                data-testid="prompt-dialog-cancel"
                class={styles.cancelButton}
                onClick={props.onCancel}
              >
                {props.cancelLabel ?? 'Cancel'}
              </button>
              <button
                data-testid="prompt-dialog-confirm"
                class={styles.confirmButton}
                onClick={handleConfirm}
                disabled={!value().trim()}
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

export { PromptDialog };
