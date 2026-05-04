import { type Component, type JSX } from 'solid-js';
import { useAreaState } from '../../../app/areaState';
import styles from './FoldableSection.module.css';

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
    <div data-testid="foldable-section" class={styles.wrapper}>
      {/* 分組標題（點擊折疊） */}
      <div
        onClick={toggle}
        class={styles.header}
        classList={{ [styles.subsection]: isSubsection() }}
      >
        {/* 折疊三角：展開=▼ 折疊=▶ */}
        <span
          class={styles.arrow}
          classList={{ [styles.expanded]: expanded() }}
        >
          &#9660;
        </span>
        {props.label}
      </div>

      {/* 分組 body — grid-template-rows 動畫容器，children 保持 mounted */}
      <div
        class={styles.bodyGrid}
        classList={{ [styles.expanded]: expanded() }}
      >
        <div class={styles.bodyInner}>
          <div
            class={styles.content}
            classList={{ [styles.subsection]: isSubsection() }}
          >
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FoldableSection;
