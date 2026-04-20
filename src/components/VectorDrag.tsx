import { For, type Component } from 'solid-js';
import { NumberDrag, type NumberDragProps } from './NumberDrag';

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
    <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
      <For each={props.values}>
        {(_val, i) => {
          const idx = i();
          const override = props.overrides?.[idx];

          const label = idx < AXIS_LABELS.length ? AXIS_LABELS[idx] : String(idx);
          const badgeBg = idx < BADGE_BG.length ? BADGE_BG[idx] : '#666';

          const numberDragProps: NumberDragProps = {
            get value() { return props.values[idx]; },
            onChange: (v: number) => props.onChange(idx, v),
            step: override?.step ?? props.step,
            min: override?.min ?? props.min,
            max: override?.max ?? props.max,
            precision: override?.precision ?? props.precision,
            onDragStart: props.onDragStart,
            onDragEnd: props.onDragEnd,
          };

          return (
            <div style={{ display: 'flex', 'align-items': 'stretch', flex: 1 }}>
              <span
                style={{
                  width: '18px',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'font-size': '10px',
                  'font-weight': '700',
                  color: '#fff',
                  background: badgeBg,
                  'border-radius': '2px 0 0 2px',
                  'flex-shrink': '0',
                  cursor: 'default',
                }}
              >
                {label}
              </span>
              <div style={{ flex: 1, 'border-radius': '0 3px 3px 0', overflow: 'hidden', display: 'flex' }}>
                <NumberDrag {...numberDragProps} />
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
};
