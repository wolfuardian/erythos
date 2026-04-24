import { For, type Component } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface LadderOverlayProps {
  x: number;                       // popup 正中心的 viewport X
  y: number;                       // popup 正中心的 viewport Y
  steps: readonly number[];        // 七個 step tier，順序由大到小（第 0 個在最上）
  activeIndex: number;             // 目前選中的 tier index (0-based)
  currentValue: string;            // 已格式化好的值字串（呼叫方負責 toFixed 等）
}

const TIER_HEIGHT = 28;            // 每行高度 px
const LADDER_WIDTH = 60;           // popup 寬度 px
const PREVIEW_HEIGHT = 36;         // 預覽區塊高度 px

export const LadderOverlay: Component<LadderOverlayProps> = (props) => {
  const tierStackHeight = () => props.steps.length * TIER_HEIGHT;

  return (
    <Portal mount={document.body}>
      <div
        data-devid="ladder-overlay"
        style={{
          position: 'fixed',
          left: `${props.x}px`,
          top: `${props.y}px`,
          transform: `translate(-50%, -${tierStackHeight() / 2}px)`,
          width: `${LADDER_WIDTH}px`,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          'border-radius': 'var(--radius-md)',
          'box-shadow': 'var(--shadow-popup)',
          'z-index': '9999',
          'pointer-events': 'none',  // popup 不攔截 mouse；NumberDrag 的 document listener 處理
          'font-family': 'var(--font-mono)',
          'font-variant-numeric': 'tabular-nums',
          display: 'flex',
          'flex-direction': 'column',
        }}
      >
        <For each={props.steps}>
          {(step, idx) => {
            const active = () => idx() === props.activeIndex;
            const adjacent = () => Math.abs(idx() - props.activeIndex) === 1;
            return (
              <div
                style={{
                  height: `${TIER_HEIGHT}px`,
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'font-size': 'var(--font-size-md)',
                  background: active() ? 'var(--bg-active)' : 'transparent',
                  color: active()
                    ? 'var(--text-primary)'
                    : adjacent()
                      ? 'var(--text-secondary)'
                      : 'var(--text-muted)',
                  'font-weight': active() ? '600' : '400',
                  transition: 'background 80ms ease, color 80ms ease',
                }}
              >
                {step}
              </div>
            );
          }}
        </For>

        {/* 分隔線 */}
        <div style={{
          height: '1px',
          background: 'var(--border-subtle)',
          margin: '0 6px',
        }} />

        {/* 值預覽區塊 */}
        <div style={{
          height: `${PREVIEW_HEIGHT}px`,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'font-size': 'var(--font-size-lg)',
          'font-weight': '600',
          color: 'var(--accent-gold)',
        }}>
          {props.currentValue}
        </div>
      </div>
    </Portal>
  );
};

export { TIER_HEIGHT, LADDER_WIDTH };
