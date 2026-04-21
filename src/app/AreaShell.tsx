import { type Component, Show, createSignal } from 'solid-js';
import type { DockviewPanelApi } from './layout/solid-dockview';
import { editors } from './editors';
import { AreaContext } from './AreaContext';

interface AreaShellProps {
  panel: DockviewPanelApi;
  initialEditorType: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const [editorType, setEditorType] = createSignal(props.initialEditorType);
  const currentDef = () => editors.find(e => e.id === editorType());

  return (
    <AreaContext.Provider value={{
      id: props.panel.id,
      get editorType() { return editorType(); },
      setEditorType,
    }}>
      <Show when={currentDef()}>
        {(def) => {
          const Comp = def().component;
          return <Comp />;
        }}
      </Show>
    </AreaContext.Provider>
  );
};
