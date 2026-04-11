import { Command } from '../Command';
import type { Editor } from '../Editor';
import type { SceneNode } from '../scene/SceneFormat';

type SceneNodeKey = Exclude<keyof SceneNode, 'id'>;

/** Command to set a single non-transform property on a SceneDocument node. */
export class SetNodePropertyCommand extends Command {
  readonly type = 'SetNodeProperty';
  private uuid: string;
  private property: SceneNodeKey;
  private oldValue: unknown;
  private newValue: unknown;

  constructor(editor: Editor, uuid: string, property: SceneNodeKey, newValue: unknown) {
    super(editor);
    this.uuid = uuid;
    this.property = property;
    this.newValue = newValue;
    const node = editor.sceneDocument.getNode(uuid);
    this.oldValue = node ? node[property] : undefined;
  }

  execute(): void {
    this.editor.sceneDocument.updateNode(this.uuid, { [this.property]: this.newValue });
  }

  undo(): void {
    this.editor.sceneDocument.updateNode(this.uuid, { [this.property]: this.oldValue });
  }
}
