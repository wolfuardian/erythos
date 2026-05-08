import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './CopyAsJsonModal.module.css';

export interface CopyAsJsonModalProps {
  open: boolean;
  json: string;
  onClose: () => void;
}

const CopyAsJsonModal: Component<CopyAsJsonModalProps> = (props) => {
  const [copied, setCopied] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const handleCopy = () => {
    void navigator.clipboard.writeText(props.json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="copy-as-json-modal"
          class={styles.overlay}
          onClick={props.onClose}
        >
          <div
            data-testid="copy-as-json-dialog"
            class={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div class={styles.header}>
              <h3 class={styles.title}>Scene JSON</h3>
              <button
                data-testid="copy-as-json-copy"
                class={styles.copyButton}
                classList={{ [styles.copiedButton]: copied() }}
                onClick={handleCopy}
              >
                {copied() ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
            <pre data-testid="copy-as-json-pre" class={styles.pre}>{props.json}</pre>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { CopyAsJsonModal };
