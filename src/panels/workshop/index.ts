import type { EditorDef } from '../../app/types';
import WorkshopPanel from './WorkshopPanel';

export { default as WorkshopPanel } from './WorkshopPanel';

export const editorDef: EditorDef = {
  id: 'workshop',
  label: 'Workshop',
  category: 'Scene',
  component: WorkshopPanel,
};
