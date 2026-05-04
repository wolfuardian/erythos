import { createSignal, createEffect, onCleanup, type Component } from 'solid-js';
import { LadderOverlay, TIER_HEIGHT, LADDER_WIDTH } from './LadderOverlay';
import styles from './NumberDrag.module.css';

const STEPS = [100, 10, 1, 0.1, 0.01, 0.001, 0.0001] as const;
const DRAG_SENSITIVITY = 0.3;

export interface NumberDragProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function applyClamp(v: number, min?: number, max?: number): number {
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

export const NumberDrag: Component<NumberDragProps> = (props) => {
  const precision = () => props.precision ?? 2;

  // hovered, focused, isDragging are read by JS logic (showArrows = hovered() && !focused() && !isDragging())
  // Keep as signals, reflect into classList
  const [focused, setFocused] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const [isDragging, setIsDragging] = createSignal(false);
  const [inputText, setInputText] = createSignal(props.value.toFixed(precision()));

  const [ladderX, setLadderX] = createSignal(0);
  const [ladderY, setLadderY] = createSignal(0);
  const [activeIndex, setActiveIndex] = createSignal(3);  // 預設中間 tier (0.1)

  // Sync display value when not focused
  createEffect(() => {
    if (!focused()) {
      setInputText(props.value.toFixed(precision()));
    }
  });

  let inputRef: HTMLInputElement | undefined;
  let cleanupListeners: (() => void) | null = null;

  onCleanup(() => {
    cleanupListeners?.();
  });

  const pct = () => {
    if (props.min === undefined || props.max === undefined) return null;
    const raw = ((props.value - props.min) / (props.max - props.min)) * 100;
    return Math.min(100, Math.max(0, raw));
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (focused()) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    let basis = props.value;
    let accumDx = 0;
    let localDragging = false;
    let locked = false;
    let lastTierIndex = 3;

    setLadderX(startX);
    setLadderY(startY);
    setActiveIndex(3);

    const computeTierIndex = (clientY: number): number => {
      // startY 對應 index 3（中間）。往上 = index 減小；每 TIER_HEIGHT 變一格。
      const dy = clientY - startY;
      const raw = 3 + Math.round(dy / TIER_HEIGHT);
      return Math.max(0, Math.min(STEPS.length - 1, raw));
    };

    const onMouseMove = (me: MouseEvent) => {
      // 1. 進入拖曳狀態（供視覺用）—— 立即設定，無閾值
      if (!localDragging) {
        localDragging = true;
        setIsDragging(true);
        props.onDragStart?.();
      }

      // 2. 決定目前 tier
      const tierIndex = computeTierIndex(me.clientY);
      if (tierIndex !== lastTierIndex) {
        // Tier 切換 — 重設 basis/accumDx，避免 step 突變造成 value 跳
        basis = props.value;
        accumDx = 0;
        lastTierIndex = tierIndex;
        setActiveIndex(tierIndex);
      }

      // 3. 判斷 lock/unlock
      const horizontalFromCenter = me.clientX - startX;
      const inLockZone = Math.abs(horizontalFromCenter) > LADDER_WIDTH / 2;

      if (inLockZone && !locked) {
        locked = true;
        basis = props.value;
        accumDx = 0;
      } else if (!inLockZone && locked) {
        locked = false;
        basis = props.value;
        accumDx = 0;
      }

      // 4. 若 locked，累積 movementX 並更新值
      if (locked) {
        accumDx += me.movementX * DRAG_SENSITIVITY;
        const raw = basis + accumDx * STEPS[tierIndex];
        const clamped = applyClamp(raw, props.min, props.max);
        props.onChange(clamped);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      cleanupListeners = null;
      setIsDragging(false);

      if (!localDragging) {
        inputRef?.focus();
      } else {
        props.onDragEnd?.();
      }
      localDragging = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    cleanupListeners = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  };

  const handleBlur = () => {
    const parsed = parseFloat(inputText());
    if (!isNaN(parsed)) {
      const clamped = applyClamp(parsed, props.min, props.max);
      setFocused(false);
      props.onChange(clamped);
    } else {
      setFocused(false);
      setInputText(props.value.toFixed(precision()));
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  // hovered() is read by JS logic: showArrows = hovered() && !focused() && !isDragging()
  const showArrows = () => hovered() && !focused() && !isDragging();

  return (
    <>
      <div
        data-testid="number-drag"
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        class={styles.wrapper}
        classList={{
          [styles.hovered]: hovered() && !focused(),
          [styles.focused]: focused(),
        }}
      >
        {/* Fill bar — independent absolutely-positioned div */}
        {pct() !== null && (
          <div
            class={styles.fillBar}
            // inline-allowed: per-frame drag coordinates — width updated on pointermove
            style={{ width: `${pct()}%` }}
          />
        )}

        {/* Left arrow ‹ */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.onChange(applyClamp(props.value - (props.step ?? 0.1), props.min, props.max));
          }}
          class={styles.arrow}
          classList={{
            [styles.arrowLeft]: true,
            [styles.visible]: showArrows(),
          }}
        >
          ‹
        </div>

        <input
          ref={inputRef}
          class={styles.input}
          classList={{ [styles.focused]: focused() }}
          type="number"
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          onFocus={() => { setFocused(true); inputRef?.select(); }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />

        {/* Right arrow › */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.onChange(applyClamp(props.value + (props.step ?? 0.1), props.min, props.max));
          }}
          class={styles.arrow}
          classList={{
            [styles.arrowRight]: true,
            [styles.visible]: showArrows(),
          }}
        >
          ›
        </div>


      </div>

      {/* Ladder overlay — 拖曳中即顯示 */}
      {isDragging() && (
        <LadderOverlay
          x={ladderX()}
          y={ladderY()}
          steps={STEPS}
          activeIndex={activeIndex()}
          currentValue={props.value.toFixed(precision())}
        />
      )}
    </>
  );
};
