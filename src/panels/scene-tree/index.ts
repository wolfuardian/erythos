import type { EditorDef } from '../../app/types';
import SceneTreePanel from './SceneTreePanel';

export { default as SceneTreePanel } from './SceneTreePanel';

export const editorDef: EditorDef = {
  id: 'scene-tree',
  label: 'Scene Tree',
  category: 'Scene',
  component: SceneTreePanel,
};
