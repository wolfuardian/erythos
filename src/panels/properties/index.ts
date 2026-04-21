import type { EditorDef } from '../../app/types';
import PropertiesPanel from './PropertiesPanel';

export { default as PropertiesPanel } from './PropertiesPanel';

export const editorDef: EditorDef = {
  id: 'properties',
  label: 'Properties',
  category: 'Object',
  component: PropertiesPanel,
};
