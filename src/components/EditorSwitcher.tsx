import { type Component, createSignal, createEffect, onCleanup, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { EditorDef } from '../app/types';

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
    case 'leaf':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <ellipse cx="6.5" cy="7" rx="4" ry="3.5" stroke="currentColor" stroke-width="1" fill="none"/>
          <line x1="6.5" y1="1.5" x2="6.5" y2="3.5" stroke="currentColor" stroke-width="1"/>
          <line x1="4" y1="2.5" x2="5" y2="4" stroke="currentColor" stroke-width="0.8"/>
          <line x1="9" y1="2.5" x2="8" y2="4" stroke="currentColor" stroke-width="0.8"/>
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
    case 'context':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1.5" y="2.5" width="10" height="8" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
          <path d="M4 5L5.5 6.5L4 8" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="7" y1="8" x2="9.5" y2="8" stroke="currentColor" stroke-width="0.9"/>
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
    case 'settings':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" stroke-width="1"/>
          <path d="M6.5 1.5V3M6.5 10V11.5M1.5 6.5H3M10 6.5H11.5M3 3L4 4M10 3L9 4M3 10L4 9M10 10L9 9" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>
        </svg>
      );
    default:
      return <span style={{ 'font-size': '10px' }}>□</span>;
  }
}

const SHORTCUT_MAP: Record<string, string> = {
  'scene-tree': 'Shift F1',
  'leaf': 'Shift F2',
  'environment': 'Shift F3',
  'properties': 'Shift F4',
  'viewport': 'Shift F5',
  'context': 'Shift F6',
  'project': 'Shift F7',
  'settings': 'Shift F8',
};

export const EditorSwitcher: Component<EditorSwitcherProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [dropdownPos, setDropdownPos] = createSignal<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    visibility: 'hidden' | 'visible';
  }>({ visibility: 'hidden' });
  let btnRef!: HTMLDivElement;
  let dropdownRef!: HTMLDivElement;

  const calcPos = () => {
    const rect = btnRef.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;
    const dropW = 480;

    // 水平：預設對齊右邊緣（right = vw - rect.right），若左邊超界則 flip 左對齊，兩者皆不行則 clamp
    const rightAlignLeft = rect.right - dropW; // dropdown 左邊緣的 x（right-aligned）
    let posH: { left?: number; right?: number };
    if (rightAlignLeft >= MARGIN) {
      // 預設：對齊按鈕右邊緣，用 right 定位
      posH = { right: vw - rect.right };
    } else if (rect.left + dropW + MARGIN <= vw) {
      // flip：對齊按鈕左邊緣
      posH = { left: rect.left };
    } else {
      // clamp：貼左 8px
      posH = { left: MARGIN };
    }

    // 垂直：預設按鈕下方，若不夠則 flip 上方，兩者皆不行則 clamp
    const dropdownEl = dropdownRef as HTMLDivElement | null;
    const dropH = dropdownEl ? dropdownEl.getBoundingClientRect().height : 0;
    let posV: { top?: number; bottom?: number };
    if (rect.bottom + 4 + dropH + MARGIN <= vh) {
      posV = { top: rect.bottom + 4 };
    } else if (rect.top - 4 - dropH >= MARGIN) {
      posV = { bottom: vh - rect.top + 4 };
    } else {
      posV = { top: MARGIN };
    }

    return { ...posH, ...posV, visibility: 'visible' as const };
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
        ref={btnRef}
        onClick={toggleOpen}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '2px',
          height: '18px',
          padding: '0 4px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          'border-radius': 'var(--radius-sm)',
          border: '1px solid transparent',
          'flex-shrink': '0',
          transition: 'color 100ms ease',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.color = 'var(--text-secondary)';
          el.style.background = 'var(--bg-hover)';
          el.style.borderColor = 'var(--border-medium)';
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.color = 'var(--text-muted)';
          el.style.background = '';
          el.style.borderColor = 'transparent';
        }}
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
            data-editor-switcher-dropdown
            style={{
              position: 'fixed',
              top: dropdownPos().top !== undefined ? `${dropdownPos().top}px` : undefined,
              bottom: dropdownPos().bottom !== undefined ? `${dropdownPos().bottom}px` : undefined,
              left: dropdownPos().left !== undefined ? `${dropdownPos().left}px` : undefined,
              right: dropdownPos().right !== undefined ? `${dropdownPos().right}px` : undefined,
              visibility: dropdownPos().visibility,
              width: '480px',
              background: 'var(--bg-subsection)',
              border: '1px solid var(--border-medium)',
              'border-radius': 'var(--radius-md)',
              'box-shadow': '0 8px 24px rgba(0,0,0,0.6)',
              'z-index': '9999',
              padding: '8px',
              'font-size': '11px',
              display: 'grid',
              'grid-template-columns': 'repeat(3, 1fr)',
              gap: '0 8px',
            }}
          >
            <For each={CATEGORY_ORDER}>
              {(cat) => {
                const items = () => groups()[cat] ?? [];
                return (
                  <div>
                    {/* Category header */}
                    <div style={{
                      padding: '4px 6px 2px',
                      'font-size': '9px',
                      'text-transform': 'uppercase',
                      'letter-spacing': '0.5px',
                      color: 'var(--text-muted)',
                      'font-weight': '600',
                      'border-bottom': '1px solid var(--border-subtle)',
                      'margin-bottom': '2px',
                    }}>
                      {cat}
                    </div>
                    {/* Items */}
                    <For each={items()}>
                      {(editor) => {
                        const isActive = () => props.currentId === editor.id;
                        return (
                          <div
                            onClick={() => handleSelect(editor.id)}
                            style={{
                              display: 'flex',
                              'align-items': 'center',
                              gap: '7px',
                              padding: '4px 6px',
                              color: isActive() ? 'var(--text-primary)' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              'border-radius': 'var(--radius-sm)',
                              background: isActive() ? 'var(--bg-selected)' : 'transparent',
                              position: 'relative',
                            }}
                            onMouseEnter={e => {
                              const el = e.currentTarget as HTMLElement;
                              if (!isActive()) {
                                el.style.background = 'var(--bg-hover)';
                                el.style.color = 'var(--text-primary)';
                              } else {
                                el.style.background = 'var(--bg-selected-hover)';
                              }
                            }}
                            onMouseLeave={e => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.background = isActive() ? 'var(--bg-selected)' : 'transparent';
                              el.style.color = isActive() ? 'var(--text-primary)' : 'var(--text-secondary)';
                            }}
                          >
                            {/* Icon */}
                            <span style={{
                              width: '15px',
                              height: '15px',
                              display: 'flex',
                              'align-items': 'center',
                              'justify-content': 'center',
                              'flex-shrink': '0',
                              color: isActive() ? 'var(--accent-blue-hover)' : 'var(--accent-blue)',
                            }}>
                              <EditorIcon id={editor.id} />
                            </span>
                            {/* Label */}
                            <span style={{ flex: '1', 'font-size': '11px' }}>
                              {editor.label}
                            </span>
                            {/* Shortcut */}
                            <span style={{
                              'font-family': "'Cascadia Code', monospace",
                              'font-size': '9px',
                              color: isActive() ? 'var(--text-muted)' : 'var(--text-disabled)',
                              'white-space': 'nowrap',
                            }}>
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
