import { type Component, type JSX, splitProps } from 'solid-js';
import styles from './Panel.module.css';

export interface PanelProps extends JSX.HTMLAttributes<HTMLDivElement> {
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
  testid?: string;
  children?: JSX.Element;
}

const Panel: Component<PanelProps> = (props) => {
  const [local, rest] = splitProps(props, ['ref', 'testid', 'children', 'class']);
  return (
    <div
      ref={local.ref}
      data-testid={local.testid}
      class={styles.panel}
      {...rest}
    >
      {local.children}
    </div>
  );
};

export { Panel };
