import { Euler, type Object3D } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class SetRotationCommand extends Command {
  readonly type = 'SetRotation';
  updatable = true;
  private object: Object3D;
  private oldRotation: Euler;
  private newRotation: Euler;

  constructor(editor: Editor, object: Object3D, newRotation: Euler, oldRotation?: Euler) {
    super(editor);
    this.object = object;
    this.oldRotation = oldRotation?.clone() ?? object.rotation.clone();
    this.newRotation = newRotation.clone();
  }

  execute(): void {
    this.object.rotation.copy(this.newRotation);
    this.editor.events.emit('objectChanged', this.object);
  }

  undo(): void {
    this.object.rotation.copy(this.oldRotation);
    this.editor.events.emit('objectChanged', this.object);
  }

  update(cmd: Command): void {
    if (cmd instanceof SetRotationCommand) {
      this.newRotation.copy(cmd.newRotation);
    }
  }

  canMerge(cmd: Command): boolean {
    return cmd instanceof SetRotationCommand && cmd.object === this.object;
  }
}
