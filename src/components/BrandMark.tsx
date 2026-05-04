import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './BrandMark.module.css';

interface Props {
  /** App version string without leading "v", e.g. "0.1.15a-016eb9cf". */
  appVersion: string;
}

const BrandMark: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
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
        data-testid="brand-mark"
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        title={`Erythos v${props.appVersion}`}
        class={styles.button}
        classList={{ [styles.open]: open() }}
      >
        E
      </button>

      <Show when={open()}>
        <Portal>
          <div
            data-testid="brand-mark-about"
            ref={popoverRef}
            class={styles.popover}
            // inline-allowed: computed offset from getBoundingClientRect
            style={{ top: `${popoverPos().top}px`, left: `${popoverPos().left}px` }}
          >
            <div
              data-testid="brand-mark-about-name"
              class={styles.name}
            >
              Erythos
            </div>
            <div
              data-testid="brand-mark-about-version"
              class={styles.version}
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
