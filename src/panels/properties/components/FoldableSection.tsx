import { createSignal, type Component, type JSX } from 'solid-js';

interface FoldableSectionProps {
  /** localStorage key 後綴，例如 'object' → erythos.properties.foldable.object */
  sectionKey: string;
  label: string;
  children: JSX.Element;
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

  return (
    <div style={{ 'margin-top': '4px' }}>
      {/* 分組標題（點擊折疊） */}
      <div
        onClick={toggle}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          'font-size': 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
          'text-transform': 'uppercase',
          'letter-spacing': '0.5px',
          padding: '5px 2px',
          'margin-bottom': '4px',
          background: 'transparent',
          'border-bottom': '1px solid var(--border-subtle)',
          'font-weight': '600',
          cursor: 'pointer',
          'user-select': 'none',
        }}
      >
        {/* 折疊三角：展開=▼ 折疊=▶ */}
        <span style={{
          display: 'inline-block',
          'font-size': '8px',
          color: 'var(--text-muted)',
          transform: expanded() ? 'translateY(-1px)' : 'translateY(-1px) rotate(-90deg)',
          transition: 'transform 0.15s',
        }}>
          &#9660;
        </span>
        {props.label}
      </div>

      {/* 分組 body（tint 容器）*/}
      {expanded() && (
        <div style={{
          background: 'var(--bg-section)',
          padding: '6px 10px',
          'margin-bottom': '6px',
          'border-radius': 'var(--radius-sm)',
        }}>
          {/* 內部欄位縮排 14px */}
          <div style={{ 'padding-left': '14px' }}>
            {props.children}
          </div>
        </div>
      )}
    </div>
  );
};

export default FoldableSection;
