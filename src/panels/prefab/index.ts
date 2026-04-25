import type { EditorDef } from '../../app/types';
import PrefabPanel from './PrefabPanel';

export { default as PrefabPanel } from './PrefabPanel';

export const editorDef: EditorDef = {
  id: 'prefab',
  label: 'Prefab',
  category: 'Scene',
  component: PrefabPanel,
};
