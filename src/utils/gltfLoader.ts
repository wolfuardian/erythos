import { ImportGLTFCommand } from '../core/commands/ImportGLTFCommand';
import { convertGLTFToNodes } from './gltfConverter';
import type { Editor } from '../core/Editor';
import * as GlbStore from '../core/scene/GlbStore';

export async function loadGLTFFromFile(file: File, editor: Editor): Promise<string> {
  const source = file.name;
  const fileName = source.replace(/\.[^.]+$/, '');

  const buffer = await file.arrayBuffer();
  const gltfScene = await editor.resourceCache.loadFromBuffer(source, buffer);

  const groupNode = editor.sceneDocument.createNode(fileName);
  const childNodes = convertGLTFToNodes(gltfScene, groupNode.id, source);

  editor.execute(new ImportGLTFCommand(editor, [groupNode, ...childNodes]));
  return groupNode.id;
}

/**
 * 從 GlbStore 快取載入已知 GLB 到場景。
 * 若 filename 不在快取中，返回 null（不拋例外）。
 * 返回 groupNode.id（與 loadGLTFFromFile 一致）。
 */
export async function loadGLTFFromCache(
  filename: string,
  editor: Editor,
): Promise<string | null> {
  const buffer = await GlbStore.get(filename);
  if (!buffer) return null;

  const source = filename;
  const name = source.replace(/\.[^.]+$/, '');

  const gltfScene = await editor.resourceCache.loadFromBuffer(source, buffer);
  const groupNode = editor.sceneDocument.createNode(name);
  const childNodes = convertGLTFToNodes(gltfScene, groupNode.id, source);

  editor.execute(new ImportGLTFCommand(editor, [groupNode, ...childNodes]));
  return groupNode.id;
}
