import type { EditorDef } from '../../app/types';
import EnvironmentPanel from './EnvironmentPanel';

export { default as EnvironmentPanel } from './EnvironmentPanel';

export const editorDef: EditorDef = {
  id: 'environment',
  label: 'Environment',
  category: 'Scene',
  component: EnvironmentPanel,
};
