import { Switch, Match, createMemo, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import ObjectDraw from './object/ObjectDraw';
import TransformDraw from './object/TransformDraw';
import MultiSelectDraw from './object/MultiSelectDraw';

const PropertiesPanel: Component = () => {
  const bridge = useEditor();

  const selectedUUIDs = createMemo(() => bridge.selectedUUIDs());

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-md)',
    }}>
      <Switch fallback={
        <div style={{
          color: 'var(--text-muted)',
          'font-size': 'var(--font-size-sm)',
          'text-align': 'center',
          'padding-top': 'var(--space-2xl)',
        }}>
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
  );
};

export default PropertiesPanel;
