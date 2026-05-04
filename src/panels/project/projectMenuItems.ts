import type { MenuItem } from '../../components/ContextMenu';
import type { ProjectFile } from '../../core/project/ProjectFile';

export interface ProjectMenuCtx {
  /** The file that was right-clicked; null when right-clicking empty area. */
  file: ProjectFile | null;
  /** All currently selected asset paths. */
  selectedPaths: string[];
  /** Load/open a scene file. */
  onLoadScene: (path: string) => void;
  /** Trigger the delete confirm dialog for the given paths. */
  onRequestDelete: (paths: string[]) => void;
  /** Trigger the new scene prompt dialog. */
  onRequestNewScene: () => void;
}

/**
 * Pure function — no SolidJS hooks, no side-effects beyond invoking callbacks.
 * Returns the context menu item array for the project panel based on the
 * current file and selection state.
 */
export function buildProjectMenuItems(ctx: ProjectMenuCtx): MenuItem[] {
  const { file, selectedPaths, onLoadScene, onRequestDelete, onRequestNewScene } = ctx;

  if (file === null) {
    // Empty area right-click
    return [
      { label: 'New Scene...', action: () => onRequestNewScene() },
    ];
  }

  const isBatch = selectedPaths.length > 1;

  if (isBatch) {
    // Batch mode: N items selected
    const n = selectedPaths.length;
    return [
      {
        label: `Delete ${n} items`,
        action: () => onRequestDelete([...selectedPaths]),
      },
      { label: '---' },
      { label: 'New Scene...', action: () => onRequestNewScene() },
    ];
  }

  // Single mode
  if (file.type === 'scene') {
    return [
      { label: 'Open Scene', action: () => onLoadScene(file.path) },
      {
        label: 'Delete',
        action: () => onRequestDelete([file.path]),
      },
      { label: '---' },
      { label: 'New Scene...', action: () => onRequestNewScene() },
    ];
  }

  // Single, non-scene type
  return [
    {
      label: 'Delete',
      action: () => onRequestDelete([file.path]),
    },
    { label: '---' },
    { label: 'New Scene...', action: () => onRequestNewScene() },
  ];
}
