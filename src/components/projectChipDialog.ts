/** Pending confirm intent — tracks what to do after user confirms */
export type ConfirmIntent =
  | { kind: 'close' }
  | { kind: 'open'; id: string; name: string }
  | { kind: 'delete' };

/**
 * Builds the ConfirmDialog copy for a given intent + autosave status.
 * Pure function — no hooks, no signals. See spec §5.3.
 */
export function buildChipConfirmDialog(
  intent: ConfirmIntent,
  autosaveStatus: 'idle' | 'pending' | 'saved' | 'error',
): { title: string; message: string; confirm: string; variant: 'default' | 'danger' } {
  if (autosaveStatus === 'error') {
    return {
      title: 'Save Failed — Continue Anyway?',
      message: 'Recent changes could not be saved. Continuing will lose them.',
      confirm: 'Continue Anyway',
      variant: 'danger',
    };
  }
  if (intent.kind === 'close') {
    return {
      title: 'Close project?',
      message: 'The current project will be closed.',
      confirm: 'Close',
      variant: 'danger',
    };
  }
  if (intent.kind === 'delete') {
    return {
      title: 'Delete cloud project?',
      message: 'This permanently deletes the scene on the server. This cannot be undone.',
      confirm: 'Delete',
      variant: 'danger',
    };
  }
  return {
    title: `Switch to "${intent.name}"?`,
    message: 'The current project will be closed.',
    confirm: 'Switch anyway',
    variant: 'danger',
  };
}
