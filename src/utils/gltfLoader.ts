import { ImportGLTFCommand } from '../core/commands/ImportGLTFCommand';
import { convertGLTFToNodes } from './gltfConverter';
import type { Editor } from '../core/Editor';
import type { NodeUUID } from './branded';

export async function loadGLTFFromFile(file: File, editor: Editor): Promise<NodeUUID> {
  // 1. Import the file into the project's models/ folder
  const path = await editor.projectManager.importAsset(file);

  // 2. Get (or create) a blob URL for the imported asset
  const url = await editor.projectManager.urlFor(path);

  // 3. Load and cache the GLTF via URL
  const gltfScene = await editor.resourceCache.loadFromURL(url);

  // 4. Build v1 scene nodes. In v1 shape, node.asset holds the assets:// URL.
  //    After loadFromURL, the blob URL is in ResourceCache; we store it in node.asset
  //    so SceneSync can look it up via resourceCache.has(node.asset).
  const lastSegment = path.split('/').pop() ?? path;
  const fileName = lastSegment.replace(/\.[^.]+$/, '');
  const groupNode = editor.sceneDocument.createNode(fileName);
  groupNode.nodeType = 'group';

  const childNodes = convertGLTFToNodes(gltfScene, groupNode.id, path);

  // Replace assets:// URL with the resolved blob URL so SceneSync can look it up
  // in ResourceCache immediately (before the full loadScene hydration cycle).
  for (const node of childNodes) {
    if (node.nodeType === 'mesh' && node.asset && node.asset.startsWith('assets://')) {
      node.asset = url;
    }
  }

  editor.execute(new ImportGLTFCommand(editor, [groupNode, ...childNodes]));
  return groupNode.id;
}
