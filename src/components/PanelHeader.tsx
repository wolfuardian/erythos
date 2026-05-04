import type { Component, JSX } from 'solid-js';
import { useArea } from '../app/AreaContext';
import { useEditorsRegistry } from '../app/EditorContext';
import { EditorSwitcher } from './EditorSwitcher';
import styles from './PanelHeader.module.css';

export interface PanelHeaderProps {
  title: string;
  actions?: JSX.Element;
}

const PanelHeader: Component<PanelHeaderProps> = (props) => {
  const area = useArea();
  const editors = useEditorsRegistry();

  return (
    <div
      data-testid="panel-header"
      class={styles.header}
    >
      <span>{props.title}</span>
      <div class={styles.actions}>
        {props.actions}
        {area && (
          <EditorSwitcher
            editors={editors}
            currentId={area.editorType}
            onSelect={area.setEditorType}
          />
        )}
      </div>
    </div>
  );
};

export { PanelHeader };
