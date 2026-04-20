import { type Component } from 'solid-js';

type XYZAxis = 'x' | 'y' | 'z';

interface XYZCellReadonlyProps {
  axis: XYZAxis;
  value: string; // 靜態展示（含 MIXED em-dash）
}

/** 唯讀版（MultiSelectDraw + Delta Transform 使用） — 縱排無 badge */
export const XYZCellReadonly: Component<XYZCellReadonlyProps> = (props) => (
  <div style={{
    flex: '1',
    height: '22px',
    display: 'flex',
    'align-items': 'center',
    padding: '0 6px',
    'font-size': '10px',
    'font-variant-numeric': 'tabular-nums',
    color: 'var(--text-secondary)',
    'white-space': 'nowrap',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
    background: 'var(--bg-input)',
    'border-radius': '3px',
  }}>
    {props.value}
  </div>
);
