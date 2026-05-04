import { Index, type Component } from 'solid-js';
import { NumberDrag } from './NumberDrag';
import styles from './VectorDrag.module.css';

interface AxisOverride {
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
}

export interface VectorDragProps {
  values: number[];
  onChange: (index: number, v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  overrides?: AxisOverride[];
}

const AXIS_LABELS = ['X', 'Y', 'Z'];
const BADGE_BG = ['#c04040', '#3a9060', '#527fc8'];

export const VectorDrag: Component<VectorDragProps> = (props) => {
  return (
    <div data-testid="vector-drag" class={styles.wrapper}>
      <Index each={props.values}>
        {(val, idx) => {
          const override = props.overrides?.[idx];

          const label = idx < AXIS_LABELS.length ? AXIS_LABELS[idx] : String(idx);
          const badgeBg = idx < BADGE_BG.length ? BADGE_BG[idx] : '#666';

          return (
            <div class={styles.axisCell}>
              <span
                class={styles.badge}
                // inline-allowed: CSS variable injection — per-axis static color consumed by CSS
                style={{ '--badge-bg': badgeBg }}
              >
                {label}
              </span>
              <div class={styles.inputWrap}>
                <NumberDrag
                  value={val()}
                  onChange={(v) => props.onChange(idx, v)}
                  step={override?.step ?? props.step}
                  min={override?.min ?? props.min}
                  max={override?.max ?? props.max}
                  precision={override?.precision ?? props.precision}
                  onDragStart={props.onDragStart}
                  onDragEnd={props.onDragEnd}
                />
              </div>
            </div>
          );
        }}
      </Index>
    </div>
  );
};
