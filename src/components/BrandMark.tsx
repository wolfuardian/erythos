import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

interface Props {
  /** App version string without leading "v", e.g. "0.1.15a-016eb9cf". */
  appVersion: string;
}

const BrandMark: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const [popoverPos, setPopoverPos] = createSignal<{ top: number; left: number }>({ top: 0, left: 0 });

  let buttonRef: HTMLButtonElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  // Esc closes popover
  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // Click-outside closes popover (deferred to avoid closing on the opening click)
  createEffect(() => {
    if (!open()) return;
    const timer = setTimeout(() => {
      const onDocClick = (e: MouseEvent) => {
        if (buttonRef && buttonRef.contains(e.target as Node)) return;
        if (popoverRef && popoverRef.contains(e.target as Node)) return;
        setOpen(false);
      };
      document.addEventListener('click', onDocClick);
      onCleanup(() => document.removeEventListener('click', onDocClick));
    }, 0);
    onCleanup(() => clearTimeout(timer));
  });

  const handleClick = () => {
    if (!open() && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        data-devid="brand-mark"
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`Erythos v${props.appVersion}`}
        style={{
          width: '18px',
          height: '18px',
          background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-blue) 100%)',
          'border-radius': 'var(--radius-sm)',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'var(--text-primary)',
          'font-family': 'var(--font-family)',
          'font-weight': '700',
          'font-size': '11px',
          'line-height': '1',
          padding: '0',
          border: 'none',
          cursor: 'pointer',
          'flex-shrink': '0',
          outline: open() ? '1px solid var(--accent-gold)' : 'none',
          'outline-offset': '-1px',
          filter: hovered() && !open() ? 'brightness(1.12)' : 'none',
          transition: 'filter var(--transition-fast)',
        }}
      >
        E
      </button>

      <Show when={open()}>
        <Portal>
          <div
            data-devid="brand-mark-about"
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${popoverPos().top}px`,
              left: `${popoverPos().left}px`,
              'z-index': '900',
              width: '280px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-medium)',
              'border-radius': 'var(--radius-md)',
              'box-shadow': 'var(--shadow-popup)',
              padding: '12px 14px',
              display: 'flex',
              'flex-direction': 'column',
              gap: '4px',
            }}
          >
            <div
              data-devid="brand-mark-about-name"
              style={{
                'font-family': 'var(--font-family)',
                'font-size': '13px',
                color: 'var(--text-primary)',
                'line-height': '1',
              }}
            >
              Erythos
            </div>
            <div
              data-devid="brand-mark-about-version"
              style={{
                'font-family': 'var(--font-mono)',
                'font-size': '11px',
                color: 'var(--text-muted)',
                'line-height': '1',
              }}
            >
              v{props.appVersion}
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
};

export { BrandMark };
