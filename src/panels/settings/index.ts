import type { EditorDef } from '../../app/types';
import SettingsPanel from './SettingsPanel';

export { default as SettingsPanel } from './SettingsPanel';

export const editorDef: EditorDef = {
  id: 'settings',
  label: 'Settings',
  category: 'App',
  component: SettingsPanel,
};
