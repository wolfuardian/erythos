import { createSignal, type Component, type JSX } from 'solid-js';

interface FoldableSectionProps {
  /** localStorage key 後綴，例如 'object' → erythos.properties.foldable.object */
  sectionKey: string;
  label: string;
  children: JSX.Element;
  /**
   * 視覺變體
   * - "default"（預設）: bg-section + shadow-well-inner
   * - "subsection": bg-subsection + shadow-well-subtle（Subtle Well，用於巢狀子面板）
   */
  variant?: 'default' | 'subsection';
}

const STORAGE_PREFIX = 'erythos.properties.foldable.';

function readStored(key: string): boolean {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key);
    return v === null ? true : v === 'true'; // 預設展開
  } catch {
    return true;
  }
}

const FoldableSection: Component<FoldableSectionProps> = (props) => {
  const [expanded, setExpanded] = createSignal(readStored(props.sectionKey));

  const toggle = () => {
    const next = !expanded();
    setExpanded(next);
    try {
      localStorage.setItem(STORAGE_PREFIX + props.sectionKey, String(next));
    } catch { /* ignore */ }
  };

  const isSubsection = () => props.variant === 'subsection';

  return (
    <div style={{ 'margin-top': '4px' }}>
      {/* 分組標題（點擊折疊） */}
      <div
        onClick={toggle}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          height: '24px',
          padding: '0 8px',
          background: isSubsection() ? 'var(--bg-subheader)' : 'var(--bg-header)',
          'font-size': '11px',
          color: 'var(--text-primary)',
          'text-transform': 'uppercase',
          'letter-spacing': '0.05em',
          'font-weight': '600',
          cursor: 'pointer',
          'user-select': 'none',
          'border-radius': isSubsection() ? '3px 3px 0 0' : '0',
        }}
      >
        {/* 折疊三角：展開=▼ 折疊=▶ */}
        <span style={{
          display: 'inline-block',
          'font-size': '8px',
          color: 'var(--text-muted)',
          transform: expanded() ? 'none' : 'rotate(-90deg)',
          transition: 'transform 0.15s',
        }}>
          &#9660;
        </span>
        {props.label}
      </div>

      {/* 分組 body */}
      {expanded() && (
        <div style={{
          background: isSubsection() ? 'var(--bg-subsection)' : 'var(--bg-section)',
          padding: '6px 10px',
          'margin-bottom': '6px',
          'border-radius': isSubsection() ? '0 0 3px 3px' : 'var(--radius-md)',
          'box-shadow': isSubsection() ? 'var(--shadow-well-subtle)' : 'var(--shadow-well-inner)',
        }}>
          {props.children}
        </div>
      )}
    </div>
  );
};

export default FoldableSection;
