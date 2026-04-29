import type { Editor } from '../Editor';

const DEBOUNCE_DELAY = 2000;

export class AutoSave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly schedule: () => void;

  constructor(private readonly editor: Editor) {
    this.schedule = () => this.scheduleSnapshot();
    editor.sceneDocument.events.on('nodeAdded', this.schedule);
    editor.sceneDocument.events.on('nodeRemoved', this.schedule);
    editor.sceneDocument.events.on('nodeChanged', this.schedule);
    editor.sceneDocument.events.on('sceneReplaced', this.schedule);
  }

  private scheduleSnapshot(): void {
    this.editor.events.emit('autosaveStatusChanged', 'pending');
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flushNow(); }, DEBOUNCE_DELAY);
  }

  /** Clear pending timer + 立刻同步寫入 */
  async flushNow(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const json = JSON.stringify(this.editor.sceneDocument.serialize());
    const path = this.editor.projectManager.currentScenePath();
    try {
      await this.editor.projectManager.writeFile(path, json);
      this.editor.events.emit('autosaveStatusChanged', 'saved');
    } catch (err) {
      console.warn('[AutoSave] writeFile failed:', err);
      this.editor.events.emit('autosaveStatusChanged', 'error');
    }
  }

  dispose(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.editor.sceneDocument.events.off('nodeAdded', this.schedule);
    this.editor.sceneDocument.events.off('nodeRemoved', this.schedule);
    this.editor.sceneDocument.events.off('nodeChanged', this.schedule);
    this.editor.sceneDocument.events.off('sceneReplaced', this.schedule);
  }
}
