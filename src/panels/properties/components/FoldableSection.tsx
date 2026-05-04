import { type Component, type JSX } from 'solid-js';
import { useAreaState } from '../../../app/areaState';

interface FoldableSectionProps {
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

const FoldableSection: Component<FoldableSectionProps> = (props) => {
  const [expanded, setExpanded] = useAreaState<boolean>(props.sectionKey, true);

  const toggle = () => setExpanded(v => !v);

  const isSubsection = () => props.variant === 'subsection';

  return (
    <div data-testid="foldable-section" style={{ 'margin-top': '4px' }}>
      {/* 分組標題（點擊折疊） */}
      <div
        onClick={toggle}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          padding: isSubsection() ? '5px 0 5px 14px' : '5px 0 5px 2px',
          background: 'transparent',
          'font-size': 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
          'text-transform': 'uppercase',
          'letter-spacing': '0.5px',
          'font-weight': '600',
          cursor: 'pointer',
          'user-select': 'none',
          'margin-bottom': '4px',
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

      {/* 分組 body — grid-template-rows 動畫容器，children 保持 mounted */}
      <div style={{
        display: 'grid',
        'grid-template-rows': expanded() ? '1fr' : '0fr',
        opacity: expanded() ? '1' : '0',
        transition: 'grid-template-rows 0.1s ease, opacity 0.1s ease',
        overflow: 'hidden',
      }}>
        <div style={{ 'min-height': '0', overflow: 'hidden' }}>
          <div style={{
            background: isSubsection()
              ? 'color-mix(in srgb, var(--bg-section) 70%, var(--bg-app) 30%)'
              : 'var(--bg-section)',
            padding: '6px 10px',
            'margin-bottom': isSubsection() ? '0' : '6px',
            'border-radius': 'var(--radius-sm)',
            'box-shadow': isSubsection() ? 'none' : 'var(--shadow-well-inner)',
          }}>
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FoldableSection;
