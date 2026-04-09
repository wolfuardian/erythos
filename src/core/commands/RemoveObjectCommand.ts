import type { Object3D } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class RemoveObjectCommand extends Command {
  readonly type = 'RemoveObject';
  private object: Object3D;
  private parent: Object3D;
  private index: number;

  constructor(editor: Editor, object: Object3D) {
    super(editor);
    this.object = object;
    this.parent = object.parent ?? editor.scene;
    this.index = this.parent.children.indexOf(object);
  }

  execute(): void {
    if (this.editor.selection.selected === this.object) {
      this.editor.selection.select(null);
    }
    this.parent.remove(this.object);
    this.editor.events.emit('objectRemoved', this.object, this.parent);
    this.editor.events.emit('sceneGraphChanged');
  }

  undo(): void {
    // Re-insert at original index
    const children = this.parent.children;
    this.parent.add(this.object);
    // Move from end to original position
    if (this.index < children.length - 1) {
      children.splice(children.length - 1, 1);
      children.splice(this.index, 0, this.object);
    }
    this.editor.events.emit('objectAdded', this.object);
    this.editor.events.emit('sceneGraphChanged');
  }
}
