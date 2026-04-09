import type { Object3D } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class AddObjectCommand extends Command {
  readonly type = 'AddObject';
  private object: Object3D;
  private parent: Object3D;

  constructor(editor: Editor, object: Object3D, parent?: Object3D) {
    super(editor);
    this.object = object;
    this.parent = parent ?? editor.scene;
  }

  execute(): void {
    this.parent.add(this.object);
    this.editor.events.emit('objectAdded', this.object);
    this.editor.events.emit('sceneGraphChanged');
    this.editor.selection.select(this.object);
  }

  undo(): void {
    this.parent.remove(this.object);
    this.editor.events.emit('objectRemoved', this.object, this.parent);
    this.editor.events.emit('sceneGraphChanged');
    if (this.editor.selection.selected === this.object) {
      this.editor.selection.select(null);
    }
  }
}
