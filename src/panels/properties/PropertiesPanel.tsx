import { Switch, Match, createMemo, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import ObjectDraw from './object/ObjectDraw';
import TransformDraw from './object/TransformDraw';
import MultiSelectDraw from './object/MultiSelectDraw';

const PropertiesPanel: Component = () => {
  const bridge = useEditor();

  const selectedObjects = createMemo(() => {
    bridge.objectVersion();
    return bridge.selectedObjects();
  });

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
        <Match when={selectedObjects().length === 1}>
          <ObjectDraw object={selectedObjects()[0]} />
          <TransformDraw object={selectedObjects()[0]} />
        </Match>
        <Match when={selectedObjects().length > 1}>
          <MultiSelectDraw objects={selectedObjects()} />
        </Match>
      </Switch>
    </div>
  );
};

export default PropertiesPanel;
