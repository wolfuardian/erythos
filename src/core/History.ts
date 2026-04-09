import type { Command } from './Command';
import type { EventEmitter } from './EventEmitter';

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private events: EventEmitter;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  execute(cmd: Command): void {
    cmd.execute();

    // Try to merge with the last command
    const last = this.undoStack[this.undoStack.length - 1];
    if (last?.updatable && last.canMerge?.(cmd)) {
      last.update!(cmd);
    } else {
      this.undoStack.push(cmd);
    }

    // Executing a new command clears redo history
    this.redoStack.length = 0;
    this.events.emit('historyChanged');
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.events.emit('historyChanged');
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
    this.events.emit('historyChanged');
  }

  /** Seal the last command so new commands cannot merge into it. */
  sealLast(): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last) last.updatable = false;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.events.emit('historyChanged');
  }
}
