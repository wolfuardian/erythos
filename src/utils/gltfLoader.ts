import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { ImportGLTFCommand } from '../core/commands/ImportGLTFCommand';
import type { Editor } from '../core/Editor';

export async function loadGLTFFromFile(file: File, editor: Editor): Promise<void> {
  const buffer = await file.arrayBuffer();
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(buffer, '');
  gltf.scene.name = file.name.replace(/\.[^.]+$/, '');
  editor.execute(new ImportGLTFCommand(editor, gltf.scene));
}
