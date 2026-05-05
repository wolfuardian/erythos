import { Component } from 'solid-js';
import styles from './ColorInput.module.css';

interface ColorInputProps {
  value: number;
  onInput: (v: number) => void;
  onChange?: () => void;
}

export const ColorInput: Component<ColorInputProps> = (props) => {
  const hexStr = () => '#' + props.value.toString(16).padStart(6, '0');

  return (
    <div class={styles.wrapper}>
      <input
        type="color"
        class={styles.swatch}
        value={hexStr()}
        onInput={(e) => props.onInput(parseInt(e.currentTarget.value.slice(1), 16))}
        onChange={() => props.onChange?.()}
      />
      <span class={styles.hexLabel}>{hexStr()}</span>
    </div>
  );
};
