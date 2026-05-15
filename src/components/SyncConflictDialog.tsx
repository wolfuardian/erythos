import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { SyncConflictPayload } from '../app/bridge';
import styles from './SyncConflictDialog.module.css';

export interface SyncConflictDialogProps {
  conflict: SyncConflictPayload | null;
  onKeepLocal: () => void;
  onUseCloud: () => void;
}

/**
 * Produce a line-by-line unified diff between two JSON strings.
 * Lines present in `before` but not `after` are prefixed with `-`;
 * lines present in `after` but not `before` are prefixed with `+`;
 * identical lines are prefixed with a space.
 *
 * This is a simple LCS-free linear scan: it works best for small documents
 * where most lines are shared, which is the normal case for .erythos scene
 * files (< 50 KB serialized JSON).
 */
function computeLineDiff(before: string, after: string): Array<{ kind: 'same' | 'removed' | 'added'; text: string }> {
  const aLines = before.split('\n');
  const bLines = after.split('\n');

  // Build a map from line content → indices in bLines for efficient lookup
  const bIndex = new Map<string, number[]>();
  for (let i = 0; i < bLines.length; i++) {
    const line = bLines[i];
    const arr = bIndex.get(line);
    if (arr) arr.push(i);
    else bIndex.set(line, [i]);
  }

  const result: Array<{ kind: 'same' | 'removed' | 'added'; text: string }> = [];
  let bi = 0;

  for (let ai = 0; ai < aLines.length; ai++) {
    const aLine = aLines[ai];
    const candidates = bIndex.get(aLine);
    const nextB = candidates?.find((idx) => idx >= bi);

    if (nextB !== undefined) {
      // Flush any bLines we skipped (added lines)
      for (let j = bi; j < nextB; j++) {
        result.push({ kind: 'added', text: bLines[j] });
      }
      result.push({ kind: 'same', text: aLine });
      bi = nextB + 1;
    } else {
      result.push({ kind: 'removed', text: aLine });
    }
  }

  // Any remaining bLines are additions
  for (let j = bi; j < bLines.length; j++) {
    result.push({ kind: 'added', text: bLines[j] });
  }

  return result;
}

const SyncConflictDialog: Component<SyncConflictDialogProps> = (props) => {
  const [showDiff, setShowDiff] = createSignal(false);

  // Close on Escape key — bound only while dialog is open
  createEffect(() => {
    if (props.conflict === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Esc collapses diff first if open, otherwise does nothing
        // (conflict must be explicitly resolved — Esc does not dismiss)
        if (showDiff()) setShowDiff(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const diffLines = () => {
    const c = props.conflict;
    if (!c) return [];
    const localJson = JSON.stringify(c.localBody.serialize(), null, 2);
    const cloudJson = JSON.stringify(c.cloudBody.serialize(), null, 2);
    return computeLineDiff(localJson, cloudJson);
  };

  return (
    <Show when={props.conflict !== null}>
      <Portal>
        <div
          data-testid="sync-conflict-dialog"
          class={styles.overlay}
        >
          <div
            class={styles.dialog}
            classList={{ [styles.dialogExpanded]: showDiff() }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class={styles.title}>Sync conflict</h3>
            <p class={styles.message}>
              The cloud has a newer version (v{props.conflict!.currentVersion}) of this scene.
              Your local changes have been saved to a backup file.
              Choose which version to keep:
              <span class={styles.bakPath}>
                Backup: {props.conflict!.scenePath}.bak.v{props.conflict!.baseVersion}
              </span>
            </p>

            <Show when={showDiff()}>
              <div
                data-testid="sync-conflict-diff-section"
                class={styles.diffSection}
              >
                <div class={styles.diffLegend}>
                  <span class={styles.legendRemoved}>- local</span>
                  <span class={styles.legendAdded}>+ cloud</span>
                </div>
                <pre class={styles.diffPre}>
                  {diffLines().map((line) => (
                    <span
                      class={
                        line.kind === 'removed'
                          ? styles.diffRemoved
                          : line.kind === 'added'
                            ? styles.diffAdded
                            : styles.diffSame
                      }
                    >
                      {line.kind === 'removed' ? '- ' : line.kind === 'added' ? '+ ' : '  '}
                      {line.text}
                      {'\n'}
                    </span>
                  ))}
                </pre>
              </div>
            </Show>

            <div class={styles.actions}>
              <button
                data-testid="sync-conflict-show-diff"
                class={`${styles.button} ${styles.showDiffButton}`}
                onClick={() => setShowDiff((v) => !v)}
              >
                {showDiff() ? 'Hide diff' : 'Show diff'}
              </button>
              <div class={styles.actionsSpacer} />
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
