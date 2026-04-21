import type { EditorDef } from '../../app/types';
import ViewportPanel from './ViewportPanel';

export { default as ViewportPanel } from './ViewportPanel';

export const editorDef: EditorDef = {
  id: 'viewport',
  label: 'Viewport',
  category: 'Scene',
  component: ViewportPanel,
};
