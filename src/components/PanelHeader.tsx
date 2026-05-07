import type { Component, JSX } from 'solid-js';
import styles from './PanelHeader.module.css';

export interface PanelHeaderProps {
  title: string;
  actions?: JSX.Element;
}

const PanelHeader: Component<PanelHeaderProps> = (props) => {
  return (
    <div
      data-testid="panel-header"
      class={styles.header}
    >
      <span>{props.title}</span>
      <div class={styles.actions}>
        {props.actions}
      </div>
    </div>
  );
};

export { PanelHeader };
