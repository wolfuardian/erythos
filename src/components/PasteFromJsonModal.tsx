import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './PasteFromJsonModal.module.css';

export interface PasteFromJsonModalProps {
  open: boolean;
  /** Called when user confirms import with the raw text content. */
  onImport: (text: string) => void;
  onClose: () => void;
}

const PasteFromJsonModal: Component<PasteFromJsonModalProps> = (props) => {
  const [text, setText] = createSignal('');
  const [clipboardError, setClipboardError] = createSignal('');

  // When the modal opens, try to pre-populate textarea from clipboard.
  createEffect(() => {
    if (!props.open) return;
    setText('');
    setClipboardError('');

    void navigator.clipboard.readText().then(
      (content) => setText(content),
      () => setClipboardError('Could not read clipboard automatically — paste JSON manually below.'),
    );
  });

  // Escape key closes modal.
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const handleImport = () => {
    props.onImport(text());
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="paste-from-json-modal"
          class={styles.overlay}
          onClick={props.onClose}
        >
          <div
            data-testid="paste-from-json-dialog"
            class={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div class={styles.header}>
              <h3 class={styles.title}>Paste from JSON</h3>
            </div>
            <Show when={clipboardError()}>
              <p data-testid="paste-from-json-clipboard-error" class={styles.clipboardError}>
                {clipboardError()}
              </p>
            </Show>
            <textarea
              data-testid="paste-from-json-textarea"
              class={styles.textarea}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
              placeholder="Paste scene JSON here..."
              spellcheck={false}
            />
            <div class={styles.actions}>
              <button
                data-testid="paste-from-json-cancel"
                class={styles.cancelButton}
                onClick={props.onClose}
              >
                Cancel
              </button>
              <button
                data-testid="paste-from-json-import"
                class={styles.importButton}
                onClick={handleImport}
                disabled={text().trim() === ''}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { PasteFromJsonModal };
