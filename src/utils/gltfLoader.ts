import { ImportGLTFCommand } from '../core/commands/ImportGLTFCommand';
import { convertGLTFToNodes } from './gltfConverter';
import type { Editor } from '../core/Editor';
import * as GlbStore from '../core/scene/GlbStore';

export async function loadGLTFFromFile(file: File, editor: Editor): Promise<string> {
  let path: string;

  if (editor.projectManager.isOpen) {
    // 複製檔案到專案目錄，auto-suffix 重名，回傳 project-relative path（如 models/chair.glb）
    path = await editor.projectManager.importAsset(file);
  } else {
    // toy mode 退化：無專案時使用 file.name，GLB 不複製到目錄
    path = file.name;
    console.warn('[loadGLTFFromFile] No project open, GLB not copied to project; mesh.source uses file name only');
  }

  // 群組節點名稱：取最後 '/' 後再去副檔名
  const lastSegment = path.split('/').pop() ?? path;
  const fileName = lastSegment.replace(/\.[^.]+$/, '');

  const buffer = await file.arrayBuffer();
  const gltfScene = await editor.resourceCache.loadFromBuffer(path, buffer);

  const groupNode = editor.sceneDocument.createNode(fileName);
  const childNodes = convertGLTFToNodes(gltfScene, groupNode.id, path);

  editor.execute(new ImportGLTFCommand(editor, [groupNode, ...childNodes]));
  return groupNode.id;
}

/**
 * 從 GlbStore 快取載入已知 GLB 到場景。
 * filename 語意為 project-relative path（如 models/chair.glb）。
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
  const lastSegment = source.split('/').pop() ?? source;
  const name = lastSegment.replace(/\.[^.]+$/, '');

  const gltfScene = await editor.resourceCache.loadFromBuffer(source, buffer);
  const groupNode = editor.sceneDocument.createNode(name);
  const childNodes = convertGLTFToNodes(gltfScene, groupNode.id, source);

  editor.execute(new ImportGLTFCommand(editor, [groupNode, ...childNodes]));
  return groupNode.id;
}
