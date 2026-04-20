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
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
      background: 'var(--bg-panel)',
      'box-shadow': 'var(--shadow-well-outer)',
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 10px',
        'border-bottom': '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
        'font-size': 'var(--font-size-xs)',
        'text-transform': 'uppercase',
        'letter-spacing': '0.5px',
        'flex-shrink': 0,
      }}>
        Properties
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '4px 10px 10px',
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
    </div>
  );
};

export default PropertiesPanel;
