import { type Component, Show, createSignal } from 'solid-js';
import type { DockviewPanelApi } from './layout/solid-dockview';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { PanelHeader } from '../components/PanelHeader';
import { EditorSwitcher } from '../components/EditorSwitcher';

interface AreaShellProps {
  panel: DockviewPanelApi;
  initialEditorType: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const [editorType, setEditorType] = createSignal(props.initialEditorType);
  const currentDef = () => editors.find(e => e.id === editorType());

  return (
    <AreaContext.Provider value={{ id: props.panel.id, editorType: editorType() }}>
      <div style={{
        display: 'flex',
        'flex-direction': 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}>
        <PanelHeader
          title={(currentDef()?.label ?? editorType()).toUpperCase()}
          actions={
            <EditorSwitcher
              editors={editors}
              currentId={editorType()}
              onSelect={setEditorType}
            />
          }
        />
        <div style={{ flex: '1', overflow: 'hidden', 'min-height': '0' }}>
          <Show when={currentDef()}>
            {(def) => {
              const Comp = def().component;
              return <Comp />;
            }}
          </Show>
        </div>
      </div>
    </AreaContext.Provider>
  );
};
