import { onMount, type Component, type JSX } from 'solid-js';
import { useArea } from '../../../app/AreaContext';
import { useAreaState } from '../../../app/areaState';

interface FoldableSectionProps {
  /** 對應 panelStates 的 key，同時用於 migration 讀舊 localStorage key */
  sectionKey: string;
  label: string;
  children: JSX.Element;
  /**
   * 視覺變體
   * - "default"（預設）: bg-section + shadow-well-inner
   * - "subsection": bg-subsection + shadow-well-subtle（Subtle Well，用於巢狀子面板）
   */
  variant?: 'default' | 'subsection';
  /**
   * 命名空間，舊 migration 用；新狀態存入 panelStates，不再依賴此值路由
   * 保留 prop 避免呼叫端報型別錯誤
   */
  scope?: string;
}

const FoldableSection: Component<FoldableSectionProps> = (props) => {
  const area = useArea();
  // effectiveScope 僅用於舊 key migration 讀取，不影響新的 panelStates 路由
  const effectiveScope = () => props.scope ?? area?.id ?? 'default';

  // --- Migration：在 useAreaState 之前決定 initial ---
  // 讀舊 key 格式 erythos.foldable.<scope>.<sectionKey>
  // 若 panelStates 有值（useAreaState 內部會優先用），migration 寫入不影響；
  // 若 panelStates 無值且舊 key 有值，用舊值作 initial，mount 後強制 set 寫入 panelStates，並清除舊 key。
  let migratedValue: boolean | null = null;
  try {
    const oldKey = `erythos.foldable.${effectiveScope()}.${props.sectionKey}`;
    const raw = localStorage.getItem(oldKey);
    if (raw !== null) {
      migratedValue = raw === 'true';
    }
  } catch { /* ignore */ }

  // 決定 useAreaState 的 initial：
  // - 若找到舊 key 值，用它（migration fallback）
  // - 否則預設展開（true）
  const initial = migratedValue !== null ? migratedValue : true;

  const [expanded, setExpanded] = useAreaState<boolean>(props.sectionKey, initial);

  onMount(() => {
    // 若有舊 key 值，強制 set 一次以確保寫入 panelStates（避免 useAreaState 拿到 initial 後不觸發 setter）
    if (migratedValue !== null) {
      setExpanded(migratedValue);
      // 清除舊 key（一次性 migration）
      try {
        const oldKey = `erythos.foldable.${effectiveScope()}.${props.sectionKey}`;
        localStorage.removeItem(oldKey);
      } catch { /* ignore */ }
    }
  });

  const toggle = () => setExpanded(v => !v);

  const isSubsection = () => props.variant === 'subsection';

  return (
    <div data-devid="foldable-section" style={{ 'margin-top': '4px' }}>
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
            background: isSubsection() ? 'var(--bg-subsection)' : 'var(--bg-section)',
            padding: '6px 10px',
            'margin-bottom': '6px',
            'border-radius': isSubsection() ? '0 0 3px 3px' : 'var(--radius-md)',
            'box-shadow': isSubsection() ? 'var(--shadow-well-subtle)' : 'var(--shadow-well-inner)',
          }}>
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FoldableSection;
