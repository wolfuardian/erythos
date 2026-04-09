import { Vector3, type Object3D } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class SetPositionCommand extends Command {
  readonly type = 'SetPosition';
  updatable = true;
  private object: Object3D;
  private oldPosition: Vector3;
  private newPosition: Vector3;

  constructor(editor: Editor, object: Object3D, newPosition: Vector3, oldPosition?: Vector3) {
    super(editor);
    this.object = object;
    this.oldPosition = oldPosition?.clone() ?? object.position.clone();
    this.newPosition = newPosition.clone();
  }

  execute(): void {
    this.object.position.copy(this.newPosition);
    this.editor.events.emit('objectChanged', this.object);
  }

  undo(): void {
    this.object.position.copy(this.oldPosition);
    this.editor.events.emit('objectChanged', this.object);
  }

  update(cmd: Command): void {
    if (cmd instanceof SetPositionCommand) {
      this.newPosition.copy(cmd.newPosition);
    }
  }

  canMerge(cmd: Command): boolean {
    return cmd instanceof SetPositionCommand && cmd.object === this.object;
  }
}
