import { type Component, createSignal, Show, For } from 'solid-js';
import { useEditor } from '../app/EditorContext';
import styles from './BrokenRefsBadge.module.css';

/**
 * BrokenRefsBadge -- toolbar chip showing the count of broken asset references.
 *
 * Subscribes to bridge.brokenRefIds() and displays a count chip.
 * Clicking the chip expands a dropdown listing the names of broken nodes.
 */
export const BrokenRefsBadge: Component = () => {
  const bridge = useEditor();
  const [expanded, setExpanded] = createSignal(false);

  const brokenNodes = () => {
    const ids = bridge.brokenRefIds();
    return bridge.nodes().filter(n => ids.has(n.id));
  };

  const count = () => brokenNodes().length;

  return (
    <Show when={count() > 0}>
      <div data-testid="broken-refs-badge" class={styles.wrapper}>
        <button
          data-testid="broken-refs-badge-chip"
          class={styles.chip}
          onClick={() => setExpanded(v => !v)}
          title="Broken asset references -- click to see details"
        >
          {count()} broken
        </button>
        <Show when={expanded()}>
          <div data-testid="broken-refs-badge-list" class={styles.list}>
            <For each={brokenNodes()}>
              {(node) => (
                <div class={styles.item}>
                  <span class={styles.itemName}>{node.name}</span>
                  <span class={styles.itemAsset}>{node.asset ?? '(no asset)'}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};
