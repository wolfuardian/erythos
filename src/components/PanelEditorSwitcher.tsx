import type { Component } from 'solid-js';
import { useArea } from '../app/AreaContext';
import { useEditorsRegistry } from '../app/EditorContext';
import { EditorSwitcher } from './EditorSwitcher';

const PanelEditorSwitcher: Component = () => {
  const area = useArea();
  const editors = useEditorsRegistry();
  if (!area) return null;
  return (
    <EditorSwitcher
      editors={editors}
      currentId={area.editorType}
      onSelect={area.setEditorType}
    />
  );
};

export { PanelEditorSwitcher };
