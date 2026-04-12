import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ImportGLTFCommand } from '../core/commands/ImportGLTFCommand';
import { convertGLTFToNodes } from './gltfConverter';
import type { Editor } from '../core/Editor';

export async function loadGLTFFromFile(file: File, editor: Editor): Promise<void> {
  const source = file.name;
  const fileName = source.replace(/\.[^.]+$/, '');

  const buffer = await file.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer, '');

  const groupNode = editor.sceneDocument.createNode(fileName);
  const childNodes = convertGLTFToNodes(gltf.scene, groupNode.id, source);

  editor.execute(new ImportGLTFCommand(editor, [groupNode, ...childNodes]));
}
