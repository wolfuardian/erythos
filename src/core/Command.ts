import type { Editor } from './Editor';

export abstract class Command {
  abstract readonly type: string;
  editor: Editor;
  updatable = false;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  abstract execute(): void;
  abstract undo(): void;

  update?(_cmd: Command): void;
  canMerge?(_cmd: Command): boolean;

  toJSON(): object {
    return { type: this.type };
  }
}
