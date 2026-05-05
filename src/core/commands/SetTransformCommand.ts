import type { Vec3 } from '../scene/SceneFormat';
import type { SceneNode } from '../scene/SceneFormat';
import { Command } from '../Command';
import type { Editor } from '../Editor';
import type { NodeUUID } from '../../utils/branded';

export class SetTransformCommand extends Command {
  readonly type = 'SetTransform';
  updatable = true;

  private uuid: NodeUUID;
  private property: 'position' | 'rotation' | 'scale';
  private oldValue: Vec3;
  private newValue: Vec3;

  constructor(
    editor: Editor,
    uuid: NodeUUID,
    property: 'position' | 'rotation' | 'scale',
    newValue: Vec3,
    oldValue: Vec3,
  ) {
    super(editor);
    this.uuid = uuid;
    this.property = property;
    this.oldValue = [...oldValue] as Vec3;
    this.newValue = [...newValue] as Vec3;
  }

  execute(): void {
    this.editor.sceneDocument.updateNode(
      this.uuid,
      { [this.property]: this.newValue } as Partial<SceneNode>,
    );
  }

  undo(): void {
    this.editor.sceneDocument.updateNode(
      this.uuid,
      { [this.property]: this.oldValue } as Partial<SceneNode>,
    );
  }

  canMerge(cmd: Command): boolean {
    return (
      cmd instanceof SetTransformCommand &&
      cmd.uuid === this.uuid &&
      cmd.property === this.property
    );
  }

  update(cmd: Command): void {
    if (cmd instanceof SetTransformCommand) {
      this.newValue = [...cmd.newValue] as Vec3;
    }
  }
}
