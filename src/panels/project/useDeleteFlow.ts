import { createSignal } from 'solid-js';
import type { Editor } from '../../core/Editor';

export interface DeleteFlowProps {
  editor: Editor;
  setSelectedAssetPaths: (v: string[]) => void;
  setError: (title: string, message: string) => void;
}

export interface DeleteFlow {
  /** Whether the confirm dialog should be visible. */
  show: () => boolean;
  /** Dynamic dialog title — "Delete file?" for single, "Delete N items?" for batch. */
  title: () => string;
  /** Dynamic dialog message listing the files to be deleted. */
  message: () => string;
  /** Called when the user confirms deletion. Closes dialog and deletes files. */
  onConfirm: () => void;
  /** Called when the user cancels. Closes dialog and clears pending paths. */
  onCancel: () => void;
  /** Open the delete confirm dialog for the given paths. */
  open: (paths: string[]) => void;
}

const MAX_SHOWN = 10;

function buildDeleteMessage(paths: string[]): string {
  const shown = paths.slice(0, MAX_SHOWN);
  const remaining = paths.length - MAX_SHOWN;
  let msg = shown.join('\n');
  if (remaining > 0) {
    msg += `\n... and ${remaining} more`;
  }
  msg += '\n\nThis action cannot be undone.';
  return msg;
}

export function useDeleteFlow(props: DeleteFlowProps): DeleteFlow {
  const [show, setShow] = createSignal(false);
  const [pendingDeletePaths, setPendingDeletePaths] = createSignal<string[]>([]);

  const open = (paths: string[]) => {
    setPendingDeletePaths(paths);
    setShow(true);
  };

  const onCancel = () => {
    setShow(false);
    setPendingDeletePaths([]);
  };

  const title = () => {
    const paths = pendingDeletePaths();
    return paths.length > 1 ? `Delete ${paths.length} items?` : 'Delete file?';
  };

  const message = () => {
    const paths = pendingDeletePaths();
    if (paths.length === 1) {
      return `"${paths[0]}" will be permanently deleted.\n\nThis action cannot be undone.`;
    }
    return buildDeleteMessage(paths);
  };

  const onConfirm = () => {
    const paths = pendingDeletePaths();
    // Close dialog and clear pending state immediately — before the async work.
    setShow(false);
    setPendingDeletePaths([]);
    if (paths.length === 0) return;

    void (async () => {
      const errors: string[] = [];
      for (const path of paths) {
        try {
          await props.editor.projectManager.deleteFile(path);
        } catch (e: any) {
          errors.push(`${path}: ${e.message ?? String(e)}`);
        }
      }
      // Clear selection after attempting all deletions.
      props.setSelectedAssetPaths([]);
      if (errors.length > 0) {
        props.setError('Delete Failed', errors.join('\n'));
      }
    })();
  };

  return { show, title, message, onConfirm, onCancel, open };
}
