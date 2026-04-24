import { type Component, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';
import { cornerDragStore } from './cornerDragStore';

interface AreaShellProps {
  areaId: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const editorType = () => {
    const drag = cornerDragStore();
    if (
      drag.phase === 'active' &&
      drag.previewEditorTypes &&
      drag.previewEditorTypes[props.areaId] !== undefined
    ) {
      return drag.previewEditorTypes[props.areaId];
    }
    return currentWorkspace().editorTypes[props.areaId] ?? 'viewport';
  };

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
        {(def) => <Dynamic component={def().component} />}
      </Show>
    </AreaContext.Provider>
  );
};
