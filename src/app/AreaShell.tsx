import { type Component, Show } from 'solid-js';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';

interface AreaShellProps {
  areaId: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const editorType = () => currentWorkspace().editorTypes[props.areaId] ?? 'viewport';

  const handleSetType = (nextId: string) => {
    mutate(s => updateCurrentWorkspace(s, {
      editorTypes: {
        ...currentWorkspace().editorTypes,
        [props.areaId]: nextId,
      },
    }));
  };

  const currentDef = () => editors.find(e => e.id === editorType());

  return (
    <AreaContext.Provider value={{
      id: props.areaId,
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
