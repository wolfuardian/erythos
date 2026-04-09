import { Vector3, type Object3D } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class SetScaleCommand extends Command {
  readonly type = 'SetScale';
  updatable = true;
  private object: Object3D;
  private oldScale: Vector3;
  private newScale: Vector3;

  constructor(editor: Editor, object: Object3D, newScale: Vector3, oldScale?: Vector3) {
    super(editor);
    this.object = object;
    this.oldScale = oldScale?.clone() ?? object.scale.clone();
    this.newScale = newScale.clone();
  }

  execute(): void {
    this.object.scale.copy(this.newScale);
    this.editor.events.emit('objectChanged', this.object);
  }

  undo(): void {
    this.object.scale.copy(this.oldScale);
    this.editor.events.emit('objectChanged', this.object);
  }

  update(cmd: Command): void {
    if (cmd instanceof SetScaleCommand) {
      this.newScale.copy(cmd.newScale);
    }
  }

  canMerge(cmd: Command): boolean {
    return cmd instanceof SetScaleCommand && cmd.object === this.object;
  }
}
