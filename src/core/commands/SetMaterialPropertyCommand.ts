import type { MaterialOverride } from '../scene/SceneFormat';
import { Command } from '../Command';
import type { Editor } from '../Editor';
import type { NodeUUID } from '../../utils/branded';

type MatProp = keyof MaterialOverride;
type MatVal = MaterialOverride[MatProp];

export class SetMaterialPropertyCommand extends Command {
  readonly type = 'SetMaterialProperty';
  updatable = true;

  private uuid: NodeUUID;
  private prop: MatProp;
  private oldValue: MatVal;
  private newValue: MatVal;

  constructor(editor: Editor, uuid: NodeUUID, prop: MatProp, newValue: MatVal, oldValue: MatVal) {
    super(editor);
    this.uuid = uuid;
    this.prop = prop;
    this.newValue = newValue;
    this.oldValue = oldValue;
  }

  execute(): void {
    const node = this.editor.sceneDocument.getNode(this.uuid);
    if (!node) return;
    const mat = node.mat ?? {};
    this.editor.sceneDocument.updateNode(this.uuid, {
      mat: { ...mat, [this.prop]: this.newValue },
    });
  }

  undo(): void {
    const node = this.editor.sceneDocument.getNode(this.uuid);
    if (!node) return;
    const mat = node.mat ?? {};
    this.editor.sceneDocument.updateNode(this.uuid, {
      mat: { ...mat, [this.prop]: this.oldValue },
    });
  }

  canMerge(cmd: Command): boolean {
    return (
      cmd instanceof SetMaterialPropertyCommand &&
      cmd.uuid === this.uuid &&
      cmd.prop === this.prop
    );
  }

  update(cmd: Command): void {
    if (cmd instanceof SetMaterialPropertyCommand) {
      this.newValue = cmd.newValue;
    }
  }
}
