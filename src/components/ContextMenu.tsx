import { For, createEffect, onCleanup, type Component } from 'solid-js';

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

const ContextMenu: Component<ContextMenuProps> = (props) => {
  let menuRef!: HTMLDivElement;

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

  // Keep the menu within the viewport using estimated dimensions (200 × 300)
  // to avoid a second render pass for exact measurement.
  const adjustedPosition = () => {
    const x = Math.min(props.position.x, window.innerWidth - 200);
    const y = Math.min(props.position.y, window.innerHeight - 300);
    return { x: Math.max(0, x), y: Math.max(0, y) };
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${adjustedPosition().x}px`,
        top: `${adjustedPosition().y}px`,
        'z-index': '1000',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        'border-radius': 'var(--radius-sm)',
        'box-shadow': '0 2px 8px rgba(0,0,0,0.3)',
        'min-width': '160px',
        padding: 'var(--space-xs) 0',
        'user-select': 'none',
      }}
    >
      <For each={props.items}>
        {(item) => (
          <div
            onClick={() => {
              if (item.disabled) return;
              item.action?.();
              props.onClose();
            }}
            style={{
              padding: 'var(--space-xs) var(--space-md)',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              'font-size': 'var(--font-size-sm)',
              'white-space': 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            {item.label}
          </div>
        )}
      </For>
    </div>
  );
};

export { ContextMenu };
