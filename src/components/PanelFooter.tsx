import { type Component, type JSX } from 'solid-js';
import styles from './PanelFooter.module.css';

export interface PanelFooterProps {
  children?: JSX.Element;
}

const PanelFooter: Component<PanelFooterProps> = (props) => {
  return (
    <div class={styles.footer}>
      {props.children}
    </div>
  );
};

export { PanelFooter };
