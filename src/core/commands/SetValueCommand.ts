import type { Object3D } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

/** Generic command to set any single property on an Object3D. */
export class SetValueCommand extends Command {
  readonly type = 'SetValue';
  private object: Object3D;
  private property: string;
  private oldValue: unknown;
  private newValue: unknown;

  constructor(editor: Editor, object: Object3D, property: string, newValue: unknown) {
    super(editor);
    this.object = object;
    this.property = property;
    this.oldValue = (object as any)[property];
    this.newValue = newValue;
  }

  execute(): void {
    (this.object as any)[this.property] = this.newValue;
    this.editor.events.emit('objectChanged', this.object);
  }

  undo(): void {
    (this.object as any)[this.property] = this.oldValue;
    this.editor.events.emit('objectChanged', this.object);
  }
}
