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
  const [hovered, setHovered] = createSignal(false);
  const [isDragging, setIsDragging] = createSignal(false);
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
    let localDragging = false;

    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      if (!localDragging && Math.abs(dx) > 3) {
        localDragging = true;
        setIsDragging(true);
        props.onDragStart?.();
        document.body.style.cursor = 'ew-resize';
      }
      if (localDragging) {
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
      setIsDragging(false);
      if (!localDragging) {
        inputRef?.focus();
      } else {
        props.onDragEnd?.();
      }
      localDragging = false;
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
          cursor: 'ew-resize',
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
          onFocus={() => setFocused(true)}
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
            padding: '0 4px',
            cursor: focused() ? 'text' : 'ew-resize',
            '-webkit-appearance': 'none',
            '-moz-appearance': 'textfield',
            position: 'relative',
            'z-index': '1',
          }}
        />

        {/* Right arrow › */}
        <div
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

        {/* Drag indicator */}
        {isDragging() && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              'z-index': '3',
              'pointer-events': 'none',
              display: 'flex',
              'align-items': 'center',
              gap: '0',
            }}
          >
            {/* Left triangle */}
            <div
              style={{
                width: '0',
                height: '0',
                'border-top': '4px solid transparent',
                'border-bottom': '4px solid transparent',
                'border-right': '5px solid var(--text-secondary)',
              }}
            />
            {/* Center bar */}
            <div
              style={{
                width: '32px',
                height: '2px',
                background: 'var(--text-secondary)',
                'border-radius': '1px',
              }}
            />
            {/* Right triangle */}
            <div
              style={{
                width: '0',
                height: '0',
                'border-top': '4px solid transparent',
                'border-bottom': '4px solid transparent',
                'border-left': '5px solid var(--text-secondary)',
              }}
            />
          </div>
        )}
      </div>
    </>
  );
};
