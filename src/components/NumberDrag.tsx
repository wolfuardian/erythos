import { createSignal, createEffect, onCleanup, type Component } from 'solid-js';
import { LadderOverlay, TIER_HEIGHT, LADDER_WIDTH } from './LadderOverlay';

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
    document.body.style.cursor = '';
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

  const showArrows = () => hovered() && !focused() && !isDragging();

  const cellBg = () => {
    if (focused()) return 'var(--bg-input-focus)';
    if (hovered()) return '#333648';
    return 'var(--bg-subsection)';
  };

  return (
    <>
      <style>{`
        .number-drag-input::-webkit-inner-spin-button,
        .number-drag-input::-webkit-outer-spin-button {
          display: none;
        }
        .number-drag-input {
          -moz-appearance: textfield;
        }
      `}</style>
      <div
        data-devid="number-drag"
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          'align-items': 'center',
          height: '22px',
          'border-radius': '2px',
          overflow: 'hidden',
          cursor: isDragging() ? 'ew-resize' : 'ew-resize',
          background: cellBg(),
          flex: '1',
          outline: focused() ? '1px solid var(--border-focus)' : 'none',
          'outline-offset': '-1px',
          transition: 'background 100ms ease',
        }}
      >
        {/* Fill bar — independent absolutely-positioned div */}
        {pct() !== null && (
          <div
            style={{
              position: 'absolute',
              left: '0',
              top: '0',
              bottom: '0',
              width: `${pct()}%`,
              background: 'var(--accent-teal)',
              opacity: '0.85',
              'border-radius': '2px 0 0 2px',
              'pointer-events': 'none',
            }}
          />
        )}

        {/* Left arrow ‹ */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.onChange(applyClamp(props.value - (props.step ?? 0.1), props.min, props.max));
          }}
          style={{
            position: 'absolute',
            left: '0',
            top: '0',
            bottom: '0',
            width: '14px',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '10px',
            'font-weight': '600',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            'z-index': '2',
            opacity: showArrows() ? '1' : '0',
            'pointer-events': showArrows() ? 'auto' : 'none',
            transition: 'opacity 100ms ease',
          }}
        >
          ‹
        </div>

        <input
          ref={inputRef}
          class="number-drag-input"
          type="number"
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          onFocus={() => { setFocused(true); inputRef?.select(); }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            flex: '1',
            width: '0',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            'font-size': 'var(--font-size-sm)',
            'font-family': 'var(--font-mono)',
            'font-variant-numeric': 'tabular-nums',
            'text-align': 'center',
            padding: '0 16px',
            cursor: isDragging() ? 'ew-resize' : (focused() ? 'text' : 'ew-resize'),
            '-webkit-appearance': 'none',
            '-moz-appearance': 'textfield',
            position: 'relative',
            'z-index': '1',
          }}
        />

        {/* Right arrow › */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.onChange(applyClamp(props.value + (props.step ?? 0.1), props.min, props.max));
          }}
          style={{
            position: 'absolute',
            right: '0',
            top: '0',
            bottom: '0',
            width: '14px',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '10px',
            'font-weight': '600',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            'z-index': '2',
            opacity: showArrows() ? '1' : '0',
            'pointer-events': showArrows() ? 'auto' : 'none',
            transition: 'opacity 100ms ease',
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
