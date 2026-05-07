import type { SceneEnv } from '../scene/SceneFormat';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class SetEnvironmentCommand extends Command {
  readonly type = 'SetEnvironment';
  updatable = true;

  private prop: keyof SceneEnv;
  private oldValue: SceneEnv[keyof SceneEnv];
  private newValue: SceneEnv[keyof SceneEnv];

  constructor(
    editor: Editor,
    prop: keyof SceneEnv,
    newValue: SceneEnv[keyof SceneEnv],
    oldValue: SceneEnv[keyof SceneEnv],
  ) {
    super(editor);
    this.prop = prop;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }

  execute(): void {
    this.editor.setEnvironmentSettings({ [this.prop]: this.newValue } as Partial<SceneEnv>);
  }

  undo(): void {
    this.editor.setEnvironmentSettings({ [this.prop]: this.oldValue } as Partial<SceneEnv>);
  }

  canMerge(cmd: Command): boolean {
    return (
      cmd instanceof SetEnvironmentCommand &&
      cmd.prop === this.prop
    );
  }

  update(cmd: Command): void {
    if (cmd instanceof SetEnvironmentCommand) {
      this.newValue = cmd.newValue;
    }
  }
}
