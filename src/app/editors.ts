import type { EditorDef } from './types';
import { editorDef as viewportDef } from '../panels/viewport';
import { editorDef as sceneTreeDef } from '../panels/scene-tree';
import { editorDef as propertiesDef } from '../panels/properties';
import { editorDef as prefabDef } from '../panels/leaf';  // ← 目錄路徑 panels/leaf 保留
import { editorDef as environmentDef } from '../panels/environment';
import { editorDef as projectDef } from '../panels/project';
import { editorDef as contextDef } from '../panels/context';
import { editorDef as settingsDef } from '../panels/settings';

export const editors: readonly EditorDef[] = [
  viewportDef,
  sceneTreeDef,
  propertiesDef,
  prefabDef,
  environmentDef,
  projectDef,
  contextDef,
  settingsDef,
];
