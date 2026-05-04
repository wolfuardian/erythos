import { type Component } from 'solid-js';
import styles from './XYZCell.module.css';

type XYZAxis = 'x' | 'y' | 'z';

interface XYZCellReadonlyProps {
  axis: XYZAxis;
  value: string; // 靜態展示（含 MIXED em-dash）
}

/** 唯讀版（MultiSelectDraw 使用） */
export const XYZCellReadonly: Component<XYZCellReadonlyProps> = (props) => (
  <div data-testid="xyz-cell" class={styles.cell}>
    <span
      class={styles.badge}
      classList={{
        [styles.x]: props.axis === 'x',
        [styles.y]: props.axis === 'y',
        [styles.z]: props.axis === 'z',
      }}
    >
      {props.axis.toUpperCase()}
    </span>
    <span class={styles.valueText}>
      {props.value}
    </span>
  </div>
);
