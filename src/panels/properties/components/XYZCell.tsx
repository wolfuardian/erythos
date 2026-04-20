import { createSignal, type Component } from 'solid-js';

type XYZAxis = 'x' | 'y' | 'z';

const BADGE_BG: Record<XYZAxis, string> = {
  x: '#c04040',
  y: '#3a9060',
  z: '#527fc8',
};

interface XYZCellEditableProps {
  axis: XYZAxis;
  value: number;
  onChange: (v: number) => void;
}

interface XYZCellReadonlyProps {
  axis: XYZAxis;
  value: string; // 靜態展示（含 MIXED em-dash）
}

/** 可編輯版（TransformDraw 使用） */
export const XYZCellEditable: Component<XYZCellEditableProps> = (props) => {
  const [focused, setFocused] = createSignal(false);

  const handleInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const v = parseFloat(e.currentTarget.value);
    if (!isNaN(v)) props.onChange(v);
  };

  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--bg-input)',
        'align-items': 'stretch',
        height: '22px',
        overflow: 'hidden',
        flex: 1,
        'border-radius': '3px',
        'box-shadow': focused()
          ? 'var(--shadow-input-inset), 0 0 0 1px color-mix(in srgb, var(--accent-gold) 50%, transparent)'
          : 'var(--shadow-input-inset)',
      }}>
      <span style={{
        width: '18px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'font-size': '10px',
        'font-weight': '700',
        color: '#fff',
        background: BADGE_BG[props.axis],
        'border-radius': '2px 0 0 2px',
        'flex-shrink': '0',
      }}>
        {props.axis.toUpperCase()}
      </span>
      <input
        type="number"
        value={props.value}
        step={0.1}
        onInput={handleInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          width: '0',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          'font-weight': '500',
          'font-size': 'var(--font-size-sm)',
          'font-family': 'var(--font-mono)',
          'font-variant-numeric': 'tabular-nums',
          padding: '0 4px',
        }}
      />
    </div>
  );
};

/** 唯讀版（MultiSelectDraw 使用） */
export const XYZCellReadonly: Component<XYZCellReadonlyProps> = (props) => (
  <div style={{
    display: 'flex',
    'align-items': 'stretch',
    background: 'var(--bg-input)',
    height: '22px',
    overflow: 'hidden',
    flex: 1,
    'border-radius': '3px',
    'box-shadow': 'var(--shadow-input-inset)',
  }}>
    <span style={{
      width: '18px',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'font-size': '10px',
      'font-weight': '700',
      color: '#fff',
      background: BADGE_BG[props.axis],
      'border-radius': '2px 0 0 2px',
      'flex-shrink': '0',
    }}>
      {props.axis.toUpperCase()}
    </span>
    <span style={{
      flex: 1,
      display: 'flex',
      'align-items': 'center',
      padding: '0 5px',
      'font-size': 'var(--font-size-sm)',
      'font-weight': '500',
      color: 'var(--text-primary)',
      'font-variant-numeric': 'tabular-nums',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap',
    }}>
      {props.value}
    </span>
  </div>
);
