/**
 * DeletionPendingBanner — fixed top banner shown when the current user's account
 * is in the 30-day grace period before deletion (G1, refs #1095).
 *
 * Displays the scheduled deletion date and a [Cancel] button that calls
 * POST /api/me/cancel-delete. Dismissible only by cancelling (banner reappears
 * on next page load until the deletion is cancelled or executed).
 *
 * Usage (App.tsx):
 *   <Show when={currentUser()?.scheduledDeleteAt != null}>
 *     <DeletionPendingBanner
 *       scheduledDeleteAt={currentUser()!.scheduledDeleteAt!}
 *       onCancel={...}
 *     />
 *   </Show>
 */

import { type Component, createSignal } from 'solid-js';
import styles from './DeletionPendingBanner.module.css';

export interface DeletionPendingBannerProps {
  /** ISO 8601 string: when the account will be hard-deleted. */
  scheduledDeleteAt: string;
  /**
   * Called when user clicks [Cancel deletion].
   * Should call POST /api/me/cancel-delete and update currentUser signal.
   */
  onCancel: () => Promise<void>;
}

/**
 * Format the deletion date for display: "May 31, 2026" (no time, locale-aware).
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export const DeletionPendingBanner: Component<DeletionPendingBannerProps> = (props) => {
  const [cancelling, setCancelling] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleCancel = async () => {
    if (cancelling()) return;
    setCancelling(true);
    setError(null);
    try {
      await props.onCancel();
      // Parent clears scheduledDeleteAt → banner unmounts
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel deletion. Please try again.');
      setCancelling(false);
    }
  };

  return (
    <div
      class={styles.banner}
      role="alert"
      aria-live="polite"
      data-testid="deletion-pending-banner"
    >
      <span class={styles.message} data-testid="deletion-pending-message">
        Your account is scheduled for deletion on {formatDate(props.scheduledDeleteAt)}.
        {error() ? ` ${error()}` : ''}
      </span>
      <button
        data-testid="deletion-pending-cancel"
        class={styles.cancelButton}
        disabled={cancelling()}
        onClick={() => void handleCancel()}
      >
        {cancelling() ? 'Cancelling…' : 'Cancel deletion'}
      </button>
    </div>
  );
};
