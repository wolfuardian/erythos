import type { EditorDef } from '../../app/types';
import ConsolePanel from './ConsolePanel';

export { default as ConsolePanel } from './ConsolePanel';

export const editorDef: EditorDef = {
  id: 'console',
  label: 'Console',
  category: 'App',
  component: ConsolePanel,
};
