import { Editor } from '../core/Editor';
import { RemoveNodeCommand } from '../core/commands/RemoveNodeCommand';

export function registerEditorKeybindings(e: Editor): void {
  e.keybindings.registerMany([
    { key: 'z', ctrl: true, action: () => e.undo(), description: 'Undo' },
    { key: 'y', ctrl: true, action: () => e.redo(), description: 'Redo' },
    { key: 'z', ctrl: true, shift: true, action: () => e.redo(), description: 'Redo (alt)' },
    { key: 'Delete', action: () => {
      const uuid = e.selection.primary;
      if (uuid) e.execute(new RemoveNodeCommand(e, uuid));
    }, description: 'Delete selected' },
    { key: 'w', action: () => e.setTransformMode('translate'), description: 'Translate mode' },
    { key: 'e', action: () => e.setTransformMode('rotate'), description: 'Rotate mode' },
    { key: 'r', action: () => e.setTransformMode('scale'), description: 'Scale mode' },
  ]);
}
