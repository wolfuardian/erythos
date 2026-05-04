import { For, type Component } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './LadderOverlay.module.css';

export interface LadderOverlayProps {
  x: number;                       // popup 正中心的 viewport X
  y: number;                       // popup 正中心的 viewport Y
  steps: readonly number[];        // 七個 step tier，順序由大到小（第 0 個在最上）
  activeIndex: number;             // 目前選中的 tier index (0-based)
  currentValue: string;            // 已格式化好的值字串（呼叫方負責 toFixed 等）
}

const TIER_HEIGHT = 28;            // 每行高度 px (must match LadderOverlay.module.css .preview height)
const LADDER_WIDTH = 60;           // popup 寬度 px

export const LadderOverlay: Component<LadderOverlayProps> = (props) => {
  const tierStackHeight = () => props.steps.length * TIER_HEIGHT;

  return (
    <Portal mount={document.body}>
      <div
        data-testid="ladder-overlay"
        class={styles.popup}
        // inline-allowed: position computed from drag-start coordinates; transform offset derived from measured tier stack height at runtime
        style={{
          left: `${props.x}px`,
          top: `${props.y}px`,
          transform: `translate(-50%, -${tierStackHeight() / 2}px)`,
          width: `${LADDER_WIDTH}px`,
        }}
      >
        <For each={props.steps}>
          {(step, idx) => {
            const active = () => idx() === props.activeIndex;
            const adjacent = () => Math.abs(idx() - props.activeIndex) === 1;
            return (
              <div
                class={styles.tier}
                classList={{
                  [styles.active]: active(),
                  [styles.adjacent]: adjacent() && !active(),
                }}
              >
                {step}
              </div>
            );
          }}
        </For>

        {/* 分隔線 */}
        <div class={styles.separator} />

        {/* 值預覽區塊 */}
        <div class={styles.preview}>
          {props.currentValue}
        </div>
      </div>
    </Portal>
  );
};

export { TIER_HEIGHT, LADDER_WIDTH };
