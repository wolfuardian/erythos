import type { LightProps } from '../scene/SceneFormat';
import { Command } from '../Command';
import type { Editor } from '../Editor';
import { asNodeUUID } from '../../utils/branded';
import type { NodeUUID } from '../../utils/branded';

type LightProp = keyof LightProps;
type LightVal = LightProps[LightProp];

export class SetLightPropertyCommand extends Command {
  readonly type = 'SetLightProperty';
  updatable = true;

  private uuid: NodeUUID;
  private prop: LightProp;
  private oldValue: LightVal;
  private newValue: LightVal;

  constructor(editor: Editor, uuid: string, prop: LightProp, newValue: LightVal, oldValue: LightVal) {
    super(editor);
    this.uuid = asNodeUUID(uuid);
    this.prop = prop;
    this.newValue = newValue;
    this.oldValue = oldValue;
  }

  execute(): void {
    const node = this.editor.sceneDocument.getNode(this.uuid);
    if (!node || !node.light) return;
    this.editor.sceneDocument.updateNode(this.uuid, {
      light: { ...node.light, [this.prop]: this.newValue },
    });
  }

  undo(): void {
    const node = this.editor.sceneDocument.getNode(this.uuid);
    if (!node || !node.light) return;
    this.editor.sceneDocument.updateNode(this.uuid, {
      light: { ...node.light, [this.prop]: this.oldValue },
    });
  }

  canMerge(cmd: Command): boolean {
    return (
      cmd instanceof SetLightPropertyCommand &&
      cmd.uuid === this.uuid &&
      cmd.prop === this.prop
    );
  }

  update(cmd: Command): void {
    if (cmd instanceof SetLightPropertyCommand) {
      this.newValue = cmd.newValue;
    }
  }
}
