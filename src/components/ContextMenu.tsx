import { For, Show, createEffect, createSignal, onCleanup, onMount, type Component } from 'solid-js';
import styles from './ContextMenu.module.css';

export interface MenuItem {
  label: string;
  action?: () => void;
  children?: MenuItem[];
  disabled?: boolean;
}

export interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
  align?: {
    itemIndex: number;
    xPercent: number;
  };
}

// MenuItemRow renders a single item and, if it has children, its submenu.
// It is not exported — it is an internal implementation detail of ContextMenu.
const MenuItemRow: Component<{ item: MenuItem; onClose: () => void }> = (props) => {
  let rowRef!: HTMLDivElement;
  const [showSub, setShowSub] = createSignal(false);

  const hasChildren = () => (props.item.children?.length ?? 0) > 0;

  // Flip the submenu to the left when there is not enough room on the right.
  const shouldFlip = () => {
    if (!rowRef) return false;
    const rect = rowRef.getBoundingClientRect();
    return rect.right + 160 > window.innerWidth;
  };

  return (
    // Outer wrapper covers both the item row AND the submenu.
    // mouseleave does not bubble, so this fires only when the pointer truly
    // exits the combined area — preventing the submenu from closing mid-transit.
    <div
      ref={rowRef}
      data-menu-item="true"
      class={styles.itemWrapper}
      onMouseEnter={() => { if (hasChildren()) setShowSub(true); }}
      onMouseLeave={() => setShowSub(false)}
    >
      <div
        onClick={() => {
          if (props.item.disabled || hasChildren()) return;
          props.item.action?.();
          props.onClose();
        }}
        class={styles.item}
        classList={{ [styles.disabled]: !!props.item.disabled }}
      >
        <span class={styles.itemLabel}>{props.item.label}</span>
        <Show when={hasChildren()}>
          <span class={styles.submenuArrow}>▶</span>
        </Show>
      </div>

      <Show when={showSub()}>
        <div
          class={`${styles.menu} ${styles.subMenu}`}
          classList={{
            [styles.subMenuLeft]: shouldFlip(),
            [styles.subMenuRight]: !shouldFlip(),
          }}
        >
          <For each={props.item.children}>
            {(child) => <MenuItemRow item={child} onClose={props.onClose} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

const ContextMenu: Component<ContextMenuProps> = (props) => {
  let menuRef!: HTMLDivElement;
  const [extraOffset, setExtraOffset] = createSignal({ x: 0, y: 0 });

  onMount(() => {
    if (!props.align) return;
    requestAnimationFrame(() => {
      const items = menuRef.querySelectorAll('[data-menu-item]');
      const target = items[props.align!.itemIndex] as HTMLElement | undefined;
      if (!target) return;
      const menuRect = menuRef.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const itemCenterFromTop = targetRect.top - menuRect.top + targetRect.height / 2;
      const menuWidth = menuRect.width;
      setExtraOffset({
        x: -(menuWidth * props.align!.xPercent),
        y: props.position.y - menuRect.top - itemCenterFromTop,
      });
    });
  });

  // Click outside to close.
  // setTimeout(0): the contextmenu event may be followed by a click event in the
  // same tick — delaying by one tick prevents that click from immediately closing
  // the menu.
  createEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', onClick);
    }, 0);
    onCleanup(() => {
      clearTimeout(timer);
      document.removeEventListener('click', onClick);
    });
  });

  // Escape to close
  createEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const adjustedPosition = () => {
    const ox = extraOffset().x;
    const oy = extraOffset().y;
    const x = Math.min(props.position.x + ox, window.innerWidth - 200);
    const y = Math.min(props.position.y + oy, window.innerHeight - 300);
    return { x: Math.max(0, x), y: Math.max(0, y) };
  };

  return (
    <div
      data-testid="context-menu"
      ref={menuRef}
      class={`${styles.menu} ${styles.menuFixed}`}
      // inline-allowed: computed offset from getBoundingClientRect alignment calculation
      style={{
        left: `${adjustedPosition().x}px`,
        top: `${adjustedPosition().y}px`,
      }}
    >
      <For each={props.items}>
        {(item) => item.label === '---'
          ? <div class={styles.separator} />
          : <MenuItemRow item={item} onClose={props.onClose} />
        }
      </For>
    </div>
  );
};

export { ContextMenu };
