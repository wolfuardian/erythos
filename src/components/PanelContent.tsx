import { type Component, type JSX, splitProps } from 'solid-js';
import styles from './PanelContent.module.css';

export interface PanelContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
  scrollable?: boolean;
  children?: JSX.Element;
}

const PanelContent: Component<PanelContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['ref', 'scrollable', 'children', 'class']);
  const scrollable = () => local.scrollable !== false;
  return (
    <div
      ref={local.ref}
      {...rest}
      class={`${styles.content}${local.class ? ' ' + local.class : ''}`}
      classList={{
        [styles.scrollable]: scrollable(),
        [styles.fixed]: !scrollable(),
      }}
    >
      {local.children}
    </div>
  );
};

export { PanelContent };
