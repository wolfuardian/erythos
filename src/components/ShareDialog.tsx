import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './ShareDialog.module.css';

export type SceneVisibility = 'private' | 'public';

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  sceneId: string;
  visibility: SceneVisibility;
  onVisibilityChange: (vis: SceneVisibility) => void;
}

const ShareDialog: Component<ShareDialogProps> = (props) => {
  const [copied, setCopied] = createSignal(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  onCleanup(() => {
    if (copiedTimer !== undefined) clearTimeout(copiedTimer);
  });

  const shareUrl = () =>
    `${window.location.origin}/scenes/${props.sceneId}`;

  const handleCopy = () => {
    if (props.visibility !== 'public') return;
    if (copiedTimer !== undefined) clearTimeout(copiedTimer);
    navigator.clipboard.writeText(shareUrl()).then(() => {
      setCopied(true);
      copiedTimer = setTimeout(() => {
        setCopied(false);
        copiedTimer = undefined;
      }, 1500);
    });
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="share-dialog"
          class={styles.overlay}
          onClick={props.onClose}
        >
          <div
            class={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class={styles.title}>Share Scene</h3>

            {/* Visibility toggle */}
            <div class={styles.visibilityRow}>
              <span class={styles.label}>Visibility</span>
              <div class={styles.toggleGroup}>
                <button
                  type="button"
                  class={styles.toggleButton}
                  classList={{ [styles.active]: props.visibility === 'private' }}
                  onClick={() => props.onVisibilityChange('private')}
                >
                  Private
                </button>
                <button
                  type="button"
                  class={styles.toggleButton}
                  classList={{ [styles.active]: props.visibility === 'public' }}
                  onClick={() => props.onVisibilityChange('public')}
                >
                  Public
                </button>
              </div>
            </div>

            {/* Copy Link area */}
            <div class={styles.copyRow}>
              <Show
                when={props.visibility === 'public'}
                fallback={
                  <span class={styles.hint}>Make public to share</span>
                }
              >
                <span class={styles.url}>{shareUrl()}</span>
              </Show>
              <button
                type="button"
                class={styles.copyButton}
                classList={{ [styles.disabled]: props.visibility !== 'public' }}
                disabled={props.visibility !== 'public'}
                onClick={handleCopy}
              >
                {copied() ? 'Copied' : 'Copy Link'}
              </button>
            </div>

            <div class={styles.actions}>
              <button
                type="button"
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

export { ShareDialog };
