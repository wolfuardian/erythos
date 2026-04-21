import type { EditorDef } from '../../app/types';
import LeafPanel from './LeafPanel';

export { default as LeafPanel } from './LeafPanel';

export const editorDef: EditorDef = {
  id: 'leaf',
  label: 'Leaf',
  category: 'Scene',
  component: LeafPanel,
};
