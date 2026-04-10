import type { Group, Object3D } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class ImportGLTFCommand extends Command {
  readonly type = 'ImportGLTF';
  private group: Group;
  private parent: Object3D;

  constructor(editor: Editor, group: Group, parent?: Object3D) {
    super(editor);
    this.group = group;
    this.parent = parent ?? editor.scene;
  }

  execute(): void {
    this.parent.add(this.group);
    this.editor.events.emit('objectAdded', this.group);
    this.editor.events.emit('sceneGraphChanged');
    this.editor.selection.select(this.group);
  }

  undo(): void {
    this.parent.remove(this.group);
    this.editor.events.emit('objectRemoved', this.group, this.parent);
    this.editor.events.emit('sceneGraphChanged');
    if (this.editor.selection.has(this.group)) {
      this.editor.selection.remove(this.group);
    }
  }
}
