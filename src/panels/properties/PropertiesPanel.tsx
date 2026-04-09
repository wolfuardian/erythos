import { Show, createMemo, type Component } from 'solid-js';
import type { Object3D } from 'three';
import { useEditor } from '../../app/EditorContext';
import ObjectDraw from './object/ObjectDraw';
import TransformDraw from './object/TransformDraw';

const PropertiesPanel: Component = () => {
  const bridge = useEditor();

  const selected = createMemo(() => {
    bridge.objectVersion(); // track changes
    return bridge.selectedObject();
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-md)',
    }}>
      <Show
        when={selected()}
        fallback={
          <div style={{
            color: 'var(--text-muted)',
            'font-size': 'var(--font-size-sm)',
            'text-align': 'center',
            'padding-top': 'var(--space-2xl)',
          }}>
            No object selected
          </div>
        }
      >
        {(obj) => (
          <>
            <ObjectDraw object={obj() as Object3D} />
            <TransformDraw object={obj() as Object3D} />
          </>
        )}
      </Show>
    </div>
  );
};

export default PropertiesPanel;
