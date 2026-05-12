import { type Component, Show, createEffect, onCleanup } from 'solid-js';
import type { SyncErrorPayload } from '../app/bridge';
import styles from './SyncErrorBanner.module.css';

// Auto-dismiss timeouts per error kind (ms)
const DISMISS_TIMEOUTS: Record<SyncErrorPayload['kind'], number> = {
  'payload-too-large': 10_000,
  'sync-failed-local-saved': 10_000,
  'network-offline': 10_000,
  'client-bug': 8_000,
};

const SYNC_ERROR_MESSAGES: Record<SyncErrorPayload['kind'], string> = {
  'payload-too-large': 'Scene exceeds size limit — reduce scene size to sync',
  'sync-failed-local-saved': 'Sync failed, local is saved',
  'network-offline': 'Sync failed (offline), local is saved',
  'client-bug': 'Sync error (internal) — please reload the page',
};

interface SyncErrorBannerProps {
  error: SyncErrorPayload;
  onDismiss: () => void;
}

export const SyncErrorBanner: Component<SyncErrorBannerProps> = (props) => {
  createEffect(() => {
    const timeout = DISMISS_TIMEOUTS[props.error.kind];
    const id = setTimeout(() => props.onDismiss(), timeout);
    onCleanup(() => clearTimeout(id));
  });

  return (
    <div
      class={styles.banner}
      role="alert"
      aria-live="assertive"
      data-testid="sync-error-banner"
    >
      <span class={styles.message} data-testid="sync-error-banner-message">
        {SYNC_ERROR_MESSAGES[props.error.kind]}
      </span>
      <button
        class={styles.dismiss}
        aria-label="Dismiss"
        onClick={props.onDismiss}
      >
        ✕
      </button>
    </div>
  );
};

interface SyncErrorOverlayProps {
  error: SyncErrorPayload | null;
  onDismiss: () => void;
}

/** Wrapper that conditionally renders the banner. Mount above all layout trees. */
export const SyncErrorOverlay: Component<SyncErrorOverlayProps> = (props) => {
  return (
    <Show when={props.error !== null}>
      <SyncErrorBanner error={props.error!} onDismiss={props.onDismiss} />
    </Show>
  );
};
