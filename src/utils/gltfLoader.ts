import { ImportGLTFCommand } from '../core/commands/ImportGLTFCommand';
import { convertGLTFToNodes } from './gltfConverter';
import type { Editor } from '../core/Editor';

export async function loadGLTFFromFile(file: File, editor: Editor): Promise<string> {
  // 1. Import the file into the project's models/ folder
  const path = await editor.projectManager.importAsset(file);

  // 2. Get (or create) a blob URL for the imported asset
  const url = await editor.projectManager.urlFor(path);

  // 3. Load and cache the GLTF via URL
  const gltfScene = await editor.resourceCache.loadFromURL(url);

  // 4. Build scene nodes; converter emits { path, nodePath } without url.
  //    We attach url to every mesh node the converter created.
  const lastSegment = path.split('/').pop() ?? path;
  const fileName = lastSegment.replace(/\.[^.]+$/, '');
  const groupNode = editor.sceneDocument.createNode(fileName);
  const childNodes = convertGLTFToNodes(gltfScene, groupNode.id, path);

  // Attach url to all mesh nodes so SceneSync can render them immediately
  for (const node of childNodes) {
    const mesh = node.components['mesh'] as { path: string; nodePath?: string; url?: string } | undefined;
    if (mesh) {
      mesh.url = url;
    }
  }

  editor.execute(new ImportGLTFCommand(editor, [groupNode, ...childNodes]));
  return groupNode.id;
}
