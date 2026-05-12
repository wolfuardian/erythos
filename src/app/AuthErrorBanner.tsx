import { type Component, Show, onMount } from 'solid-js';
import styles from './AuthErrorBanner.module.css';

// NOTE: auth_error code namespace is shared between OAuth and magic-link flows.
// Current strings happen to be method-specific (missing_code/invalid_state/
// oauth_failed are OAuth; expired/used/invalid/rate_limited are magic-link),
// but if a future OAuth refactor needs e.g. `expired`, factor out the message
// strings by flow rather than aliasing codes.
export type AuthErrorCode =
  | 'missing_code'
  | 'invalid_state'
  | 'oauth_failed'
  // Magic link verify error codes (refs docs/magic-link-spec.md § 錯誤處理)
  | 'expired'
  | 'used'
  | 'invalid'
  | 'rate_limited';

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  missing_code: "GitHub didn't return an authorization code, please retry",
  invalid_state: 'Login state verification failed, please retry',
  oauth_failed: 'Login error occurred, please try again later',
  expired: 'This sign-in link has expired. Please request a new one.',
  used: 'This sign-in link has already been used. Please request a new one.',
  invalid: 'This sign-in link is invalid. Please request a new one.',
  rate_limited: 'Too many sign-in attempts. Please wait a minute and try again.',
};

const KNOWN_CODES = new Set<string>([
  'missing_code',
  'invalid_state',
  'oauth_failed',
  'expired',
  'used',
  'invalid',
  'rate_limited',
]);

/** Parse a raw URL param into a typed AuthErrorCode, or null if unrecognized. */
export function parseAuthErrorCode(raw: string | null): AuthErrorCode | null {
  if (raw && KNOWN_CODES.has(raw)) return raw as AuthErrorCode;
  return null;
}

interface AuthErrorBannerProps {
  code: AuthErrorCode;
  onDismiss: () => void;
}

/** Top-of-screen fixed banner shown when OAuth callback returns an error code. */
export const AuthErrorBanner: Component<AuthErrorBannerProps> = (props) => {
  let dismissRef!: HTMLButtonElement;

  onMount(() => {
    dismissRef?.focus();
  });

  return (
    <div class={styles.banner} role="alert" aria-live="assertive" data-testid="auth-error-banner">
      <span class={styles.message}>{AUTH_ERROR_MESSAGES[props.code]}</span>
      <button
        ref={dismissRef}
        class={styles.dismiss}
        aria-label="Dismiss"
        onClick={props.onDismiss}
      >
        ✕
      </button>
    </div>
  );
};

interface AuthErrorOverlayProps {
  code: AuthErrorCode | null;
  onDismiss: () => void;
}

/** Wrapper that conditionally renders the banner. Mount above all layout trees. */
export const AuthErrorOverlay: Component<AuthErrorOverlayProps> = (props) => {
  return (
    <Show when={props.code !== null}>
      <AuthErrorBanner code={props.code!} onDismiss={props.onDismiss} />
    </Show>
  );
};
