import { type Component, Show, createSignal } from 'solid-js';
import type { DockviewPanelApi } from './layout/solid-dockview';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { getEditorType, setEditorType as persistType } from './editorTypeStore';

interface AreaShellProps {
  panel: DockviewPanelApi;
  initialEditorType: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  // 初始值：若 store 有記錄（使用者之前切換過），用那個；否則用 prop 指定
  const [editorType, setET] = createSignal(
    getEditorType(props.panel.id) ?? props.initialEditorType
  );

  const handleSetType = (nextId: string) => {
    setET(nextId);
    persistType(props.panel.id, nextId);
  };

  const currentDef = () => editors.find(e => e.id === editorType());

  return (
    <AreaContext.Provider value={{
      id: props.panel.id,
      get editorType() { return editorType(); },
      setEditorType: handleSetType,
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
