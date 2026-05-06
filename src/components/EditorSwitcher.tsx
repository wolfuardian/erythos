import { type Component, createSignal, createEffect, onCleanup, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { EditorDef } from '../app/types';
import styles from './EditorSwitcher.module.css';

export interface EditorSwitcherProps {
  editors: readonly EditorDef[];
  currentId: string;
  onSelect: (nextId: string) => void;
}

/** Group editors by category in display order */
const CATEGORY_ORDER: EditorDef['category'][] = ['Scene', 'Object', 'App'];

function groupByCategory(editors: readonly EditorDef[]): Record<string, EditorDef[]> {
  const groups: Record<string, EditorDef[]> = {};
  for (const e of editors) {
    if (!groups[e.category]) groups[e.category] = [];
    groups[e.category].push(e);
  }
  return groups;
}

/** Inline SVG icons keyed by editor id */
function EditorIcon(props: { id: string }) {
  switch (props.id) {
    case 'viewport':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 2L11 5.5V10.5H2V5.5L6.5 2Z" stroke="currentColor" stroke-width="1" fill="none" opacity="0.9"/>
          <circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" stroke-width="1"/>
        </svg>
      );
    case 'scene-tree':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="3" r="1.2" stroke="currentColor" stroke-width="1"/>
          <circle cx="2.5" cy="9" r="1.2" stroke="currentColor" stroke-width="1"/>
          <circle cx="10.5" cy="9" r="1.2" stroke="currentColor" stroke-width="1"/>
          <line x1="6.5" y1="4.2" x2="2.5" y2="7.8" stroke="currentColor" stroke-width="0.8"/>
          <line x1="6.5" y1="4.2" x2="10.5" y2="7.8" stroke="currentColor" stroke-width="0.8"/>
        </svg>
      );
    case 'environment':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="3.5" stroke="currentColor" stroke-width="1"/>
          <path d="M6.5 3L6.5 1M6.5 12L6.5 10M3 6.5H1M12 6.5H10" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        </svg>
      );
    case 'properties':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1.5" y="1.5" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
          <line x1="3.5" y1="4.5" x2="9.5" y2="4.5" stroke="currentColor" stroke-width="0.9"/>
          <line x1="3.5" y1="6.5" x2="9.5" y2="6.5" stroke="currentColor" stroke-width="0.9"/>
          <line x1="3.5" y1="8.5" x2="7" y2="8.5" stroke="currentColor" stroke-width="0.9"/>
        </svg>
      );
    case 'project':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1.5" y="2.5" width="10" height="8" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
          <path d="M1.5 5.5H11.5" stroke="currentColor" stroke-width="0.9"/>
          <rect x="3" y="7" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    default:
      return <span class={styles.defaultIcon}>□</span>;
  }
}

const SHORTCUT_MAP: Record<string, string> = {
  'scene-tree': 'Shift F1',
  'environment': 'Shift F2',
  'properties': 'Shift F3',
  'viewport': 'Shift F4',
  'project': 'Shift F6',
};

export const EditorSwitcher: Component<EditorSwitcherProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [dropdownPos, setDropdownPos] = createSignal<{
    top?: number;
    left?: number;
    visibility: 'hidden' | 'visible';
  }>({ visibility: 'hidden' });
  let btnRef!: HTMLDivElement;
  let dropdownRef!: HTMLDivElement;

  const calcPos = () => {
    const rect = btnRef.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 12;
    const dropW = 480;

    // 水平：右對齊按鈕（ideal left = rect.right - dropW），clamp 到 [MARGIN, vw - MARGIN - dropW]
    const idealLeft = rect.right - dropW;
    const maxLeft = vw - MARGIN - dropW;
    const left = Math.max(MARGIN, Math.min(idealLeft, maxLeft));

    // 垂直：按鈕下方 4px，clamp 到 [MARGIN, vh - MARGIN - dropH]
    const dropdownEl = dropdownRef as HTMLDivElement | null;
    const dropH = dropdownEl ? dropdownEl.getBoundingClientRect().height : 0;
    const idealTop = rect.bottom + 4;
    const maxTop = vh - MARGIN - dropH;
    const top = Math.max(MARGIN, Math.min(idealTop, maxTop));

    return { left, top, visibility: 'visible' as const };
  };

  const toggleOpen = () => {
    if (!open()) {
      // 先以 visibility:hidden 渲染，量測後再顯示
      setDropdownPos({ visibility: 'hidden' });
      setOpen(true);
      // requestAnimationFrame 等 DOM 渲染後量測
      requestAnimationFrame(() => {
        setDropdownPos(calcPos());
      });
    } else {
      setOpen(false);
    }
  };

  const handleSelect = (id: string) => {
    props.onSelect(id);
    setOpen(false);
  };

  // Close on outside pointer-down (covers splitter drag which doesn't fire click)
  const onPointerDown = (e: PointerEvent) => {
    if (!open()) return;
    const target = e.target as Node;
    if (btnRef && !btnRef.contains(target)) {
      // Check if click is inside dropdown (Portal renders outside btnRef)
      const dropdownEl = document.querySelector('[data-editor-switcher-dropdown]');
      if (dropdownEl && dropdownEl.contains(target)) return;
      setOpen(false);
    }
  };

  document.addEventListener('pointerdown', onPointerDown);
  onCleanup(() => document.removeEventListener('pointerdown', onPointerDown));

  createEffect(() => {
    if (!open()) return;
    const onResize = () => {
      if (!open()) return;
      setDropdownPos(calcPos());
    };
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  });

  const groups = () => groupByCategory(props.editors);

  return (
    <>
      {/* Trigger button: 2×2 grid icon + caret */}
      <div
        data-testid="editor-switcher"
        ref={btnRef}
        onClick={toggleOpen}
        class={styles.trigger}
      >
        {/* 2×2 grid icon */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
          <rect x="7" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
          <rect x="1" y="7" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
          <rect x="7" y="7" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
        </svg>
        {/* Caret */}
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 1.5L4 4.5L7 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      {/* Dropdown via Portal to escape clipping */}
      {open() && (
        <Portal mount={document.body}>
          <div
            ref={dropdownRef}
            data-testid="editor-switcher-dropdown"
            data-editor-switcher-dropdown
            class={styles.dropdown}
            // inline-allowed: computed offset from getBoundingClientRect + visibility toggle for measurement
            style={{
              top: dropdownPos().top !== undefined ? `${dropdownPos().top}px` : undefined,
              left: dropdownPos().left !== undefined ? `${dropdownPos().left}px` : undefined,
              visibility: dropdownPos().visibility,
            }}
          >
            <For each={CATEGORY_ORDER}>
              {(cat) => {
                const items = () => groups()[cat] ?? [];
                return (
                  <div>
                    {/* Category header */}
                    <div class={styles.categoryHeader}>
                      {cat}
                    </div>
                    {/* Items */}
                    <For each={items()}>
                      {(editor) => {
                        const isActive = () => props.currentId === editor.id;
                        return (
                          <div
                            onClick={() => handleSelect(editor.id)}
                            class={styles.editorItem}
                            classList={{ [styles.active]: isActive() }}
                          >
                            {/* Icon */}
                            <span
                              class={styles.editorIcon}
                              classList={{ [styles.activeIcon]: isActive() }}
                            >
                              <EditorIcon id={editor.id} />
                            </span>
                            {/* Label */}
                            <span class={styles.editorLabel}>
                              {editor.label}
                            </span>
                            {/* Shortcut */}
                            <span
                              class={styles.editorShortcut}
                              classList={{ [styles.activeShortcut]: isActive() }}
                            >
                              {SHORTCUT_MAP[editor.id] ?? ''}
                            </span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                );
              }}
            </For>
          </div>
        </Portal>
      )}
    </>
  );
};
