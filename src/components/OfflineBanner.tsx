import { type Component } from 'solid-js';
import styles from './OfflineBanner.module.css';

interface OfflineBannerProps {
  /**
   * When true, shows the offline cold-start cached-version variant:
   *   "Offline — viewing cached version. Reconnect to edit."
   * When false/omitted, shows the standard mid-session offline banner:
   *   "Offline — reconnect to edit. Your local cache is read-only."
   *
   * spec § Offline 策略: 冷啟動有 cache → "Offline — viewing cached version"
   */
  cached?: boolean;
}

/**
 * OfflineBanner — fixed top banner shown when the user is offline with a cloud project.
 *
 * Not dismissible by design (spec § Offline UX banner): the user must reconnect.
 * CloudProject writes are disabled while offline; LocalProject is unaffected.
 *
 * Two variants:
 *   - Default: mid-session offline (navigator went offline while editing)
 *   - cached=true: cold-start with IndexedDB cache (read-only viewer mode, #1060)
 *
 * Usage (App.tsx):
 *   <Show when={offlineCachedMode()}>
 *     <OfflineBanner cached />
 *   </Show>
 *   <Show when={!offlineCachedMode() && isOffline() && bridge()?.projectType() === 'cloud'}>
 *     <OfflineBanner />
 *   </Show>
 *
 * Spec: docs/cloud-project-spec.md § Offline UX banner + § G6
 */
export const OfflineBanner: Component<OfflineBannerProps> = (props) => {
  return (
    <div
      class={styles.banner}
      role="alert"
      aria-live="assertive"
      data-testid="offline-banner"
    >
      <span class={styles.message} data-testid="offline-banner-message">
        {props.cached
          ? 'Offline — viewing cached version. Reconnect to edit.'
          : 'Offline — reconnect to edit. Your local cache is read-only.'}
      </span>
    </div>
  );
};
