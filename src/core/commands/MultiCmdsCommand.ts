import { Command } from '../Command';
import type { Editor } from '../Editor';

/** Execute multiple commands as a single undoable unit. */
export class MultiCmdsCommand extends Command {
  readonly type = 'MultiCmds';
  private commands: Command[];

  constructor(editor: Editor, commands: Command[]) {
    super(editor);
    this.commands = commands;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}
