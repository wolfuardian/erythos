import type { EditorDef } from '../../app/types';
import ContextPanel from './ContextPanel';

export { default as ContextPanel } from './ContextPanel';

export const editorDef: EditorDef = {
  id: 'context',
  label: 'Context',
  category: 'Object',
  component: ContextPanel,
};
