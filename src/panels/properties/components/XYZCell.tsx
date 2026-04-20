import { type Component } from 'solid-js';

type XYZAxis = 'x' | 'y' | 'z';

const BADGE_BG: Record<XYZAxis, string> = {
  x: '#c04040',
  y: '#3a9060',
  z: '#527fc8',
};

interface XYZCellReadonlyProps {
  axis: XYZAxis;
  value: string; // 靜態展示（含 MIXED em-dash）
}

/** 唯讀版（MultiSelectDraw 使用） */
export const XYZCellReadonly: Component<XYZCellReadonlyProps> = (props) => (
  <div style={{
    display: 'flex',
    'align-items': 'stretch',
    background: 'transparent',
    height: '22px',
    overflow: 'hidden',
    flex: 1,
    'border-radius': '3px',
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
