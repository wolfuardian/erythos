import type { EditorDef } from '../../app/types';
import ProjectPanel from './ProjectPanel';

export { default as ProjectPanel } from './ProjectPanel';

export const editorDef: EditorDef = {
  id: 'project',
  label: 'Project',
  category: 'App',
  component: ProjectPanel,
};
