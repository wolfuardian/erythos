import type { EditorDef } from './types';
import { editorDef as viewportDef } from '../panels/viewport';
import { editorDef as sceneTreeDef } from '../panels/scene-tree';
import { editorDef as propertiesDef } from '../panels/properties';
import { editorDef as projectDef } from '../panels/project';

export const editors: readonly EditorDef[] = [
  viewportDef,
  sceneTreeDef,
  propertiesDef,
  projectDef,
];
