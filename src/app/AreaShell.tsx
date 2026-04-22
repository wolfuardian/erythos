import { type Component, Show, createSignal } from 'solid-js';
import type { DockviewPanelApi } from './layout/solid-dockview';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';

interface AreaShellProps {
  panel: DockviewPanelApi;
  initialEditorType: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const [editorType, setET] = createSignal(
    currentWorkspace().editorTypes[props.panel.id] ?? props.initialEditorType
  );

  const handleSetType = (nextId: string) => {
    setET(nextId);
    const panelId = props.panel.id;
    mutate(s => updateCurrentWorkspace(s, {
      editorTypes: { ...currentWorkspace().editorTypes, [panelId]: nextId },
    }));
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
