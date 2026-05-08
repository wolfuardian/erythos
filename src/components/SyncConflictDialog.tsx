import { type Component, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { SyncConflictPayload } from '../app/bridge';
import styles from './SyncConflictDialog.module.css';

export interface SyncConflictDialogProps {
  conflict: SyncConflictPayload | null;
  onKeepLocal: () => void;
  onUseCloud: () => void;
}

const SyncConflictDialog: Component<SyncConflictDialogProps> = (props) => {
  return (
    <Show when={props.conflict !== null}>
      <Portal>
        <div
          data-testid="sync-conflict-dialog"
          class={styles.overlay}
        >
          <div
            class={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class={styles.title}>Sync conflict</h3>
            <p class={styles.message}>
              The cloud has a newer version (v{props.conflict!.currentVersion}) of this scene.
              Your local changes have been saved to a backup file.
              Choose which version to keep:
              <span class={styles.bakPath}>
                Backup: {props.conflict!.sceneId}.bak.v{props.conflict!.currentVersion - 1}
              </span>
            </p>
            <div class={styles.actions}>
              <button
                data-testid="sync-conflict-keep-local"
                class={`${styles.button} ${styles.keepLocalButton}`}
                onClick={props.onKeepLocal}
              >
                Keep local
              </button>
              <button
                data-testid="sync-conflict-use-cloud"
                class={`${styles.button} ${styles.useCloudButton}`}
                onClick={props.onUseCloud}
              >
                Use cloud version
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { SyncConflictDialog };
