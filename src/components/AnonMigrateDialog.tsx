/**
 * AnonMigrateDialog — Anonymous → Registered scene migration prompt.
 *
 * Shown once after the user signs in (null → User transition) when they have
 * local projects that have not yet been addressed (migrated or skipped).
 *
 * Props:
 *   - entries: local ProjectEntry[] to offer for migration (pre-filtered, count > 0)
 *   - onAddSelected: callback with selected entry IDs to migrate
 *   - onSkip: dismiss and mark all listed entries as addressed
 *   - onSkipAll: set global "never ask again" flag + dismiss
 *
 * Refs: #1054
 */

import { type Component, createSignal, createMemo, For, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';
import styles from './AnonMigrateDialog.module.css';

export interface AnonMigrateDialogProps {
  open: boolean;
  entries: ProjectEntry[];
  onAddSelected: (selectedIds: string[]) => void;
  onSkip: () => void;
  onSkipAll: () => void;
}

/** Format a Unix-ms timestamp as a human-readable date string, e.g. "May 15, 2026". */
function humanizeDate(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const AnonMigrateDialog: Component<AnonMigrateDialogProps> = (props) => {
  // Set of selected entry IDs — default all selected
  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  // Re-initialise selection whenever the dialog opens with a new entry list
  createEffect(() => {
    if (props.open) {
      setSelected(new Set(props.entries.map((e) => e.id)));
    }
  });

  const allSelected = createMemo(() => selected().size === props.entries.length);
  const noneSelected = createMemo(() => selected().size === 0);

  const toggleEntry = (id: string) => {
    setSelected((prev) => {
      const next = new Set<string>(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(props.entries.map((e) => e.id)));
  const clearAll = () => setSelected(new Set<string>());

  const handleAddSelected = () => {
    props.onAddSelected([...selected()]);
  };

  // Escape key dismisses (Skip)
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onSkip();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="anon-migrate-dialog"
          class={styles.overlay}
          onClick={props.onSkip}
        >
          <div
            data-testid="anon-migrate-dialog-panel"
            class={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 data-testid="anon-migrate-dialog-title" class={styles.title}>
              Add your local projects to your account?
            </h3>
            <p data-testid="anon-migrate-dialog-desc" class={styles.description}>
              The following local projects can be uploaded to your account so you can access
              them from any device.
            </p>

            {/* Select all / Clear row */}
            <div class={styles.selectRow}>
              <button
                data-testid="anon-migrate-select-all"
                class={styles.textButton}
                onClick={selectAll}
                disabled={allSelected()}
              >
                Select all
              </button>
              <span class={styles.selectDivider}>·</span>
              <button
                data-testid="anon-migrate-clear"
                class={styles.textButton}
                onClick={clearAll}
                disabled={noneSelected()}
              >
                Clear
              </button>
            </div>

            {/* Entry list */}
            <ul data-testid="anon-migrate-entry-list" class={styles.entryList}>
              <For each={props.entries}>
                {(entry) => (
                  <li class={styles.entryItem}>
                    <label class={styles.entryLabel}>
                      <input
                        data-testid={`anon-migrate-entry-${entry.id}`}
                        type="checkbox"
                        class={styles.checkbox}
                        checked={selected().has(entry.id)}
                        onChange={() => toggleEntry(entry.id)}
                      />
                      <span class={styles.entryName}>{entry.name}</span>
                      <span class={styles.entryDate}>{humanizeDate(entry.lastOpened)}</span>
                    </label>
                  </li>
                )}
              </For>
            </ul>

            {/* Action buttons */}
            <div data-testid="anon-migrate-actions" class={styles.actions}>
              <button
                data-testid="anon-migrate-skip-all"
                class={styles.skipAllButton}
                onClick={props.onSkipAll}
              >
                Skip all (don&apos;t ask again)
              </button>
              <div class={styles.actionsPrimary}>
                <button
                  data-testid="anon-migrate-skip"
                  class={styles.cancelButton}
                  onClick={props.onSkip}
                >
                  Skip
                </button>
                <button
                  data-testid="anon-migrate-add"
                  class={styles.confirmButton}
                  onClick={handleAddSelected}
                  disabled={noneSelected()}
                >
                  Add selected
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export { AnonMigrateDialog };
