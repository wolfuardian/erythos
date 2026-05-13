import type { MenuItem } from '../../components/ContextMenu';

export interface SceneTreeMenuCtx {
  /** Accessor returning the currently selected node UUIDs. */
  selected: () => string[];
  /** Accessor returning whether the clipboard has content. */
  hasClipboard: () => boolean;
  /** When true, all mutation actions are disabled (viewer mode). */
  readOnly?: boolean;
  /** Create an empty node and add it to the scene. */
  onCreateEmpty: () => void;
  /** Create a primitive node of the given geometry type and name. */
  onCreatePrimitive: (type: string, name: string) => void;
  /** Delete all currently selected nodes (handles multi-select de-duplication). */
  onDelete: () => void;
  /** Save the single selected node as a prefab. */
  onSaveAsPrefab: () => void;
  /** Copy the selected nodes (top-level only, with subtrees) to clipboard. */
  onCopy: () => void;
  /** Cut the selected nodes (top-level only, with subtrees) from scene. */
  onCut: () => void;
  /** Paste clipboard contents into scene (under selection if single node selected). */
  onPaste: () => void;
}

/**
 * Pure function — no SolidJS hooks, no side-effects beyond invoking callbacks.
 * Returns the context menu item array for the scene tree panel based on the
 * current selection and clipboard state.
 */
export function buildSceneTreeMenuItems(ctx: SceneTreeMenuCtx): MenuItem[] {
  const selected = ctx.selected();
  const hasClip = ctx.hasClipboard();
  const ro = ctx.readOnly ?? false;

  return [
    {
      label: 'Create Empty',
      disabled: ro,
      action: () => ctx.onCreateEmpty(),
    },
    {
      label: 'Create Primitive',
      disabled: ro,
      children: ro ? [] : [
        { label: 'Box', action: () => ctx.onCreatePrimitive('box', 'Box') },
        { label: 'Sphere', action: () => ctx.onCreatePrimitive('sphere', 'Sphere') },
        { label: 'Plane', action: () => ctx.onCreatePrimitive('plane', 'Plane') },
        { label: 'Cylinder', action: () => ctx.onCreatePrimitive('cylinder', 'Cylinder') },
      ],
    },
    {
      label: 'Delete',
      disabled: ro || selected.length === 0,
      action: () => ctx.onDelete(),
    },
    {
      label: 'Save as Prefab',
      disabled: ro || selected.length !== 1,
      action: () => ctx.onSaveAsPrefab(),
    },
    {
      label: 'Copy',
      disabled: selected.length === 0,
      action: () => ctx.onCopy(),
    },
    {
      label: 'Cut',
      disabled: ro || selected.length === 0,
      action: () => ctx.onCut(),
    },
    {
      label: 'Paste',
      disabled: ro || !hasClip,
      action: () => ctx.onPaste(),
    },
  ];
}
