import { type Component, type JSX, splitProps } from 'solid-js';
import styles from './PanelToolbar.module.css';

export interface PanelToolbarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
  children?: JSX.Element;
}

const PanelToolbar: Component<PanelToolbarProps> = (props) => {
  const [local, rest] = splitProps(props, ['ref', 'children', 'class']);
  return (
    <div
      ref={local.ref}
      {...rest}
      class={`${styles.toolbar}${local.class ? ' ' + local.class : ''}`}
    >
      {local.children}
    </div>
  );
};

export { PanelToolbar };
