import type { EnvironmentSettings } from '../scene/EnvironmentSettings';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class SetEnvironmentCommand extends Command {
  readonly type = 'SetEnvironment';
  updatable = true;

  private prop: keyof EnvironmentSettings;
  private oldValue: number;
  private newValue: number;

  constructor(
    editor: Editor,
    prop: keyof EnvironmentSettings,
    newValue: number,
    oldValue: number,
  ) {
    super(editor);
    this.prop = prop;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }

  execute(): void {
    this.editor.setEnvironmentSettings({ [this.prop]: this.newValue } as Partial<EnvironmentSettings>);
  }

  undo(): void {
    this.editor.setEnvironmentSettings({ [this.prop]: this.oldValue } as Partial<EnvironmentSettings>);
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
