import { Switch, Match, createMemo, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import ObjectDraw from './object/ObjectDraw';
import TransformDraw from './object/TransformDraw';
import MultiSelectDraw from './object/MultiSelectDraw';
import { PanelHeader } from '../../components/PanelHeader';
import styles from './PropertiesPanel.module.css';

const PropertiesPanel: Component = () => {
  const bridge = useEditor();

  const selectedUUIDs = createMemo(() => bridge.selectedUUIDs());

  return (
    <div data-testid="properties-panel" class={styles.panel}>
      {/* Header */}
      <PanelHeader title="Properties" />

      {/* Body */}
      <div class={styles.body}>
        <Switch fallback={
          <div class={styles.empty}>
            No object selected
          </div>
        }>
          <Match when={selectedUUIDs().length === 1}>
            <ObjectDraw uuid={selectedUUIDs()[0]!} />
            <TransformDraw uuid={selectedUUIDs()[0]!} />
          </Match>
          <Match when={selectedUUIDs().length > 1}>
            <MultiSelectDraw uuids={selectedUUIDs()} />
          </Match>
        </Switch>
      </div>
    </div>
  );
};

export default PropertiesPanel;
