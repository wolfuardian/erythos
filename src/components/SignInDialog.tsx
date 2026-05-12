import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './SignInDialog.module.css';

export interface SignInDialogProps {
  open: boolean;
  /** Called when user clicks the GitHub OAuth button — caller navigates */
  onOpenOAuth: () => void;
  /** Triggers a magic-link sign-in email; throws on 400 / 429 / 5xx */
  onRequestMagicLink: (email: string) => Promise<void>;
  onClose: () => void;
  /** Optional ref to element that triggered the dialog; receives focus on close */
  triggerRef?: HTMLElement | null;
}

const TITLE_ID = 'sign-in-dialog-title';

type ViewState = 'idle' | 'sending' | 'sent';

const SignInDialog: Component<SignInDialogProps> = (props) => {
  const [email, setEmail] = createSignal('');
  const [state, setState] = createSignal<ViewState>('idle');
  const [error, setError] = createSignal<string | null>(null);
  let dialogRef!: HTMLDivElement;
  let oauthBtnRef!: HTMLButtonElement;
  let emailInputRef!: HTMLInputElement;

  // Reset state when dialog reopens
  createEffect(() => {
    if (!props.open) {
      setEmail('');
      setState('idle');
      setError(null);
    }
  });

  // Autofocus the primary button on open; return focus to trigger on close
  createEffect(() => {
    if (props.open) {
      requestAnimationFrame(() => oauthBtnRef?.focus());
    } else {
      props.triggerRef?.focus();
    }
  });

  // ESC close + focus trap (Tab/Shift+Tab cycles inside dialog)
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state() !== 'sending') {
        props.onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const handleGithubClick = () => {
    if (state() === 'sending') return;
    props.onOpenOAuth();
  };

  const handleEmailSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (state() === 'sending') return;
    const value = email().trim();
    if (!value) {
      setError('Please enter your email');
      emailInputRef?.focus();
      return;
    }
    // Client-side HTML5 email-format check before server round-trip
    if (emailInputRef && !emailInputRef.validity.valid) {
      setError('Please enter a valid email address');
      emailInputRef.focus();
      return;
    }
    setState('sending');
    setError(null);
    try {
      await props.onRequestMagicLink(value);
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong, please try again');
      setState('idle');
      emailInputRef?.focus();
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="sign-in-dialog"
          class={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget && state() !== 'sending') props.onClose();
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
            <h3 id={TITLE_ID} class={styles.title}>
              Sign in to Erythos
            </h3>

            <Show
              when={state() !== 'sent'}
              fallback={
                <div data-testid="sign-in-dialog-sent" class={styles.sentState}>
                  <p class={styles.sentMessage}>
                    Check your inbox at <span class={styles.sentEmail}>{email()}</span> — the
                    sign-in link is valid for 15 minutes.
                  </p>
                  <p class={styles.sentHint}>
                    Didn't get it? Check your spam folder, or close this dialog and try again.
                  </p>
                  <div class={styles.actions}>
                    <button
                      data-testid="sign-in-dialog-close"
                      type="button"
                      class={`${styles.button} ${styles.secondaryButton}`}
                      onClick={props.onClose}
                    >
                      Close
                    </button>
                  </div>
                </div>
              }
            >
              <button
                ref={oauthBtnRef}
                data-testid="sign-in-dialog-github"
                type="button"
                class={`${styles.button} ${styles.primaryButton}`}
                disabled={state() === 'sending'}
                onClick={handleGithubClick}
              >
                Sign in with GitHub
              </button>

              <div class={styles.divider}>
                <span class={styles.dividerText}>or sign in with email</span>
              </div>

              <form onSubmit={(e) => void handleEmailSubmit(e)}>
                <label class={styles.emailLabel}>
                  Email address
                  <input
                    ref={emailInputRef}
                    data-testid="sign-in-dialog-email-input"
                    type="email"
                    class={styles.emailInput}
                    placeholder="you@example.com"
                    autocomplete="email"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    disabled={state() === 'sending'}
                  />
                </label>

                <Show when={error() !== null}>
                  <p
                    data-testid="sign-in-dialog-error"
                    class={styles.error}
                    role="alert"
                    aria-live="assertive"
                  >
                    {error()}
                  </p>
                </Show>

                <div class={styles.actions}>
                  <button
                    data-testid="sign-in-dialog-cancel"
                    type="button"
                    class={`${styles.button} ${styles.secondaryButton}`}
                    disabled={state() === 'sending'}
                    onClick={props.onClose}
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="sign-in-dialog-email-submit"
                    type="submit"
                    class={`${styles.button} ${styles.primaryButton}`}
                    disabled={state() === 'sending' || !email().trim()}
                  >
                    {state() === 'sending' ? 'Sending…' : 'Send sign-in link'}
                  </button>
                </div>
              </form>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { SignInDialog };
