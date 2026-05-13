import { type Component } from 'solid-js';
import styles from './OfflineBanner.module.css';

/**
 * OfflineBanner — fixed top banner shown when the user is offline with a cloud project.
 *
 * Not dismissible by design (spec § Offline UX banner): the user must reconnect.
 * CloudProject writes are disabled while offline; LocalProject is unaffected.
 *
 * Usage (App.tsx):
 *   <Show when={isOffline() && bridge()?.projectType() === 'cloud'}>
 *     <OfflineBanner />
 *   </Show>
 *
 * Spec: docs/cloud-project-spec.md § Offline UX banner + § G6
 */
export const OfflineBanner: Component = () => {
  return (
    <div
      class={styles.banner}
      role="alert"
      aria-live="assertive"
      data-testid="offline-banner"
    >
      <span class={styles.message} data-testid="offline-banner-message">
        Offline &mdash; reconnect to edit. Your local cache is read-only.
      </span>
    </div>
  );
};
