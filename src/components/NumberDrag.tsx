import { createSignal, createEffect, onCleanup, type Component } from 'solid-js';

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
  const [inputText, setInputText] = createSignal(props.value.toFixed(precision()));

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
    e.preventDefault();
    const startX = e.clientX;
    const basis = props.value;
    let isDragging = false;

    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      if (!isDragging && Math.abs(dx) > 3) {
        isDragging = true;
        props.onDragStart?.();
        document.body.style.cursor = 'ew-resize';
      }
      if (isDragging) {
        const raw = basis + dx * (props.step ?? 0.1);
        const clamped = applyClamp(raw, props.min, props.max);
        props.onChange(clamped);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cleanupListeners = null;
      document.body.style.cursor = '';
      if (!isDragging) {
        inputRef?.focus();
      } else {
        props.onDragEnd?.();
      }
      isDragging = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    cleanupListeners = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseFloat(inputText());
    if (!isNaN(parsed)) {
      const clamped = applyClamp(parsed, props.min, props.max);
      props.onChange(clamped);
    } else {
      setInputText(props.value.toFixed(precision()));
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const p = pct();

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
        onMouseDown={handleMouseDown}
        style={{
          position: 'relative',
          display: 'flex',
          'align-items': 'center',
          height: '22px',
          'border-radius': '3px',
          overflow: 'hidden',
          'box-shadow': 'var(--shadow-input-inset)',
          cursor: 'ew-resize',
          background: p !== null
            ? `linear-gradient(to right, color-mix(in srgb, var(--accent-gold) 30%, transparent) ${p}%, transparent ${p}%)`
            : 'var(--bg-input)',
          flex: 1,
        }}
      >
        <input
          ref={inputRef}
          class="number-drag-input"
          type="number"
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            width: '0',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            'font-size': 'var(--font-size-sm)',
            'font-family': 'var(--font-mono)',
            'font-variant-numeric': 'tabular-nums',
            padding: '0 4px',
            cursor: 'ew-resize',
            '-webkit-appearance': 'none',
            '-moz-appearance': 'textfield',
          }}
        />
      </div>
    </>
  );
};
