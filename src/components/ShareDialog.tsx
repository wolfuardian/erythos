import { type Component, For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { ShareToken } from '../core/sync/ShareTokenClient';
import styles from './ShareDialog.module.css';

export type SceneVisibility = 'private' | 'public';

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  sceneId: string;
  visibility: SceneVisibility;
  onVisibilityChange: (vis: SceneVisibility) => void;
  /** Share tokens — undefined = not loaded yet (owner-only; shown only when provided) */
  tokens?: ShareToken[];
  /** Called when user clicks "Generate new link" */
  onGenerateToken?: () => Promise<void>;
  /** Called when user clicks Revoke on a token */
  onRevokeToken?: (token: string) => Promise<void>;
  /** Error from token operations */
  tokenError?: string | null;
}

const ShareDialog: Component<ShareDialogProps> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);
  const [generating, setGenerating] = createSignal(false);
  const [revokingToken, setRevokingToken] = createSignal<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let copiedTokenTimer: ReturnType<typeof setTimeout> | undefined;

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
    if (copiedTokenTimer !== undefined) clearTimeout(copiedTokenTimer);
  });

  const shareUrl = () =>
    `${window.location.origin}/scenes/${props.sceneId}`;

  const tokenShareUrl = (token: string) =>
    `${window.location.origin}/scenes/${props.sceneId}?share_token=${token}`;

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

  const handleCopyToken = (token: string) => {
    if (copiedTokenTimer !== undefined) clearTimeout(copiedTokenTimer);
    navigator.clipboard.writeText(tokenShareUrl(token)).then(() => {
      setCopiedToken(token);
      copiedTokenTimer = setTimeout(() => {
        setCopiedToken(null);
        copiedTokenTimer = undefined;
      }, 1500);
    });
  };

  const handleGenerate = async () => {
    if (!props.onGenerateToken || generating()) return;
    setGenerating(true);
    try {
      await props.onGenerateToken();
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    if (!props.onRevokeToken || revokingToken() !== null) return;
    setRevokingToken(token);
    try {
      await props.onRevokeToken(token);
    } finally {
      setRevokingToken(null);
    }
  };

  const activeTokens = () =>
    (props.tokens ?? []).filter((t) => t.revoked_at === null);

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

            {/* Copy Link area (public link) */}
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

            {/* Share tokens section — only shown when tokens prop is provided (owner only) */}
            <Show when={props.tokens !== undefined}>
              <div class={styles.tokenSection}>
                <div class={styles.tokenHeader}>
                  <span class={styles.tokenSectionLabel}>Private share links</span>
                  <button
                    data-testid="share-dialog-generate"
                    type="button"
                    class={styles.generateButton}
                    disabled={generating()}
                    onClick={() => void handleGenerate()}
                  >
                    {generating() ? 'Generating…' : 'Generate new link'}
                  </button>
                </div>

                <Show when={props.tokenError}>
                  <p data-testid="share-dialog-token-error" class={styles.tokenError}>
                    {props.tokenError}
                  </p>
                </Show>

                <Show
                  when={activeTokens().length > 0}
                  fallback={
                    <p class={styles.tokenEmptyHint}>
                      No active links. Generate one above.
                    </p>
                  }
                >
                  <ul data-testid="share-dialog-token-list" class={styles.tokenList}>
                    <For each={activeTokens()}>
                      {(t) => (
                        <li class={styles.tokenItem}>
                          <span class={styles.tokenValue} title={tokenShareUrl(t.token)}>
                            {t.token.slice(0, 8)}…
                          </span>
                          <button
                            type="button"
                            class={styles.copyButton}
                            onClick={() => handleCopyToken(t.token)}
                          >
                            {copiedToken() === t.token ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            data-testid={`share-dialog-revoke-${t.token}`}
                            type="button"
                            class={styles.revokeButton}
                            disabled={revokingToken() === t.token}
                            onClick={() => void handleRevoke(t.token)}
                          >
                            {revokingToken() === t.token ? 'Revoking…' : 'Revoke'}
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </Show>

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
