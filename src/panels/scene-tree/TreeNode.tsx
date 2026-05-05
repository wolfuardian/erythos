import { For, Show, type Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useEditor } from '../../app/EditorContext';
import { MoveNodeCommand } from '../../core/commands/MoveNodeCommand';
import type { SceneNode } from '../../core/scene/SceneFormat';
import { inferNodeType } from '../../core/scene/inferNodeType';
import {
  EyeOnIcon, EyeOffIcon, CursorOnIcon, CursorOffIcon,
  nodeTypeToIcon, nodeTypeColor,
} from './icons';
import styles from './TreeNode.module.css';
import type { NodeUUID } from '../../utils/branded';

export interface DropIndicator {
  targetId: NodeUUID;
  position: 'before' | 'inside' | 'after';
}

export interface TreeNodeProps {
  node: SceneNode;
  depth: number;
  /** For each ancestor depth 0..depth-1, whether that ancestor still has more siblings after it.
   *  Used to decide which indent guide lines to draw continuously vs stopping. */
  lineageHasMoreSiblings: boolean[];
  draggedId: () => NodeUUID | null;
  dropIndicator: () => DropIndicator | null;
  setDraggedId: (id: NodeUUID | null) => void;
  setDropIndicator: (v: DropIndicator | null) => void;
  isExpanded: (id: NodeUUID) => boolean;
  toggleExpanded: (id: NodeUUID) => void;
  eyeOffMap: () => Record<string, boolean>;
  setEyeOffMap: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  cursorOffMap: () => Record<string, boolean>;
  setCursorOffMap: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}

// Indent gutter width per depth level (px)
const INDENT_W = 16;
// Left base padding before indent
const ROW_PADDING_LEFT = 4;

export const TreeNode: Component<TreeNodeProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;

  const isSelected = () => bridge.selectedUUIDs().includes(props.node.id);
  // isHovered reads bridge state — viewport also sets this via editor.selection.hover(),
  // so we cannot reduce to CSS :hover alone; keep the signal and reflect via classList.
  const isHovered = () => bridge.hoveredUUID() === props.node.id;

  const isEyeOff = () => props.eyeOffMap()[props.node.id] ?? false;
  const isCursorOff = () => props.cursorOffMap()[props.node.id] ?? false;

  /** True if this node is itself a prefab instance root (has components.prefab). */
  const isPrefabRoot = () => props.node.components.prefab != null;

  const childNodes = () =>
    bridge.nodes()
      .filter(n => n.parent === props.node.id)
      .sort((a, b) => a.order - b.order);

  const hasChildren = () => childNodes().length > 0;

  const indicator = () => props.dropIndicator();
  const isDropTarget = () => indicator()?.targetId === props.node.id;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      editor.selection.toggle(props.node.id);
    } else {
      if (isSelected()) {
        editor.selection.select(null);
      } else {
        editor.selection.select(props.node.id);
      }
    }
  };

  const handleMouseEnter = () => editor.selection.hover(props.node.id);
  const handleMouseLeave = () => editor.selection.hover(null);

  const onDragStart = (e: DragEvent) => {
    e.stopPropagation();
    props.setDraggedId(props.node.id);
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('application/erythos-scene-node', props.node.id);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.draggedId() === props.node.id) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;

    let position: 'before' | 'inside' | 'after';
    if (y < 0.25) position = 'before';
    else if (y > 0.75) position = 'after';
    else position = 'inside';

    props.setDropIndicator({ targetId: props.node.id, position });
  };

  const onDragLeave = (e: DragEvent) => {
    // Only clear when truly leaving this row, not just entering a child element.
    const row = e.currentTarget as HTMLElement;
    if (!row.contains(e.relatedTarget as Node)) {
      const ind = props.dropIndicator();
      if (ind && ind.targetId === props.node.id) {
        props.setDropIndicator(null);
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const dragId = props.draggedId();
    const ind = props.dropIndicator();
    props.setDraggedId(null);
    props.setDropIndicator(null);

    if (!dragId || !ind || dragId === props.node.id) return;

    // Cycle check: walk target's ancestors; reject if dragged node is one of them.
    const nodes = bridge.nodes();
    let cursor: NodeUUID | null = props.node.id;
    while (cursor !== null) {
      if (cursor === dragId) return;
      const n = nodes.find(n => n.id === cursor);
      cursor = n?.parent ?? null;
    }

    let newParentId: NodeUUID | null;
    let insertIndex: number;

    if (ind.position === 'inside') {
      newParentId = props.node.id;
      insertIndex = childNodes().length;
    } else {
      newParentId = props.node.parent;
      // Filter dragId from siblings so findIndex matches MoveNodeCommand's own filter.
      const siblings = nodes
        .filter(n => n.parent === props.node.parent && n.id !== dragId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex(n => n.id === props.node.id);
      insertIndex = ind.position === 'before' ? idx : idx + 1;
    }

    // No-op check: same parent and same effective position → skip.
    const draggedNode = nodes.find(n => n.id === dragId);
    if (draggedNode && newParentId === draggedNode.parent) {
      const allSiblings = nodes
        .filter(n => n.parent === newParentId)
        .sort((a, b) => a.order - b.order);
      const currentIdx = allSiblings.findIndex(n => n.id === dragId);
      if (insertIndex === currentIdx) return;
    }

    editor.execute(new MoveNodeCommand(editor, dragId, newParentId, insertIndex));
  };

  const onDragEnd = () => {
    props.setDraggedId(null);
    props.setDropIndicator(null);
  };

  // Content-edge offset: where the name/icon area begins (for drop indicators)
  const contentLeft = () => ROW_PADDING_LEFT + props.depth * INDENT_W;

  const nodeType = () => inferNodeType(props.node);
  const iconColor = () => nodeTypeColor(nodeType());

  return (
    <div>
      <div
        data-testid="scene-tree-row"
        draggable={true}
        onClick={handleClick}
        onContextMenu={(e) => {
          if (e.ctrlKey || e.metaKey) {
            editor.selection.toggle(props.node.id);
          } else {
            if (!isSelected()) {
              editor.selection.select(props.node.id);
            }
          }
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        class={styles.row}
        classList={{
          [styles.selected]: isSelected(),
          [styles.hovered]: isHovered(),
          [styles.dropTargetInside]: isDropTarget() && indicator()?.position === 'inside',
          [styles.dragging]: props.draggedId() === props.node.id,
        }}
        // inline-allowed: CSS variable injection — depth-based padding-left consumed by CSS
        style={{ '--depth': props.depth, '--row-padding-left': `${ROW_PADDING_LEFT}px`, '--indent-w': `${INDENT_W}px` }}
      >
        {/* Selected: left 2px accent bar */}
        <Show when={isSelected()}>
          <div class={styles.selectedBar} />
        </Show>

        {/* Indent guide lines */}
        <For each={props.lineageHasMoreSiblings}>
          {(hasMore, i) => (
            <Show when={hasMore}>
              {/* inline-allowed: CSS variable injection — guide position derived from ancestor index */}
              <div
                class={styles.indentGuide}
                style={{ '--guide-left': `${ROW_PADDING_LEFT + i() * INDENT_W + 6}px` }}
              />
            </Show>
          )}
        </For>

        {/* Drop indicator: before */}
        <Show when={isDropTarget() && indicator()?.position === 'before'}>
          {/* inline-allowed: CSS variable injection — content-edge offset consumed by CSS */}
          <div
            class={styles.dropBefore}
            style={{ '--content-left': `${contentLeft()}px` }}
          />
        </Show>

        {/* Drop indicator: after */}
        <Show when={isDropTarget() && indicator()?.position === 'after'}>
          {/* inline-allowed: CSS variable injection — content-edge offset consumed by CSS */}
          <div
            class={styles.dropAfter}
            style={{ '--content-left': `${contentLeft()}px` }}
          />
        </Show>

        {/* Expand toggle */}
        <Show when={hasChildren()}>
          <span
            data-testid="scene-tree-row-expand"
            onClick={(e) => { e.stopPropagation(); props.toggleExpanded(props.node.id); }}
            class={styles.expandToggle}
          >
            {props.isExpanded(props.node.id) ? '▼' : '▶'}
          </span>
        </Show>
        <Show when={!hasChildren()}>
          <span class={styles.expandPlaceholder} />
        </Show>

        {/* Type icon (SVG) — dims when eye-off (0.38) or cursor-off (0.45) */}
        <span
          data-testid="scene-tree-row-icon"
          class={styles.nodeIcon}
          classList={{
            [styles.eyeOff]: isEyeOff(),
            [styles.cursorOff]: isCursorOff() && !isEyeOff(),
          }}
        >
          <Dynamic component={nodeTypeToIcon(nodeType())} color={iconColor()} size={13} />
        </span>

        {/* Name — dims when eye-off (0.38) or cursor-off (0.45) */}
        <span
          data-testid="scene-tree-row-name"
          class={styles.nodeName}
          classList={{
            [styles.selected]: isSelected(),
            [styles.eyeOff]: isEyeOff(),
            [styles.cursorOff]: isCursorOff() && !isEyeOff(),
          }}
        >
          {props.node.name}
        </span>

        {/* FAB badge — shown for prefab instance roots */}
        <Show when={isPrefabRoot()}>
          <span class={styles.fabBadge}>FAB</span>
        </Show>

        {/* Toggle column: eye + cursor — always visible */}
        <div class={styles.toggleColumn}>
          {/* Eye toggle */}
          <span
            data-testid="scene-tree-row-eye"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              props.setEyeOffMap(prev => ({ ...prev, [props.node.id]: !prev[props.node.id] }));
            }}
            onMouseDown={(e) => e.stopPropagation()}
            class={styles.iconBtn}
            classList={{ [styles.eyeOff]: isEyeOff() }}
          >
            <Show when={isEyeOff()} fallback={<EyeOnIcon />}>
              <EyeOffIcon />
            </Show>
          </span>

          {/* Cursor (selectability) toggle */}
          <span
            data-testid="scene-tree-row-cursor"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              props.setCursorOffMap(prev => ({ ...prev, [props.node.id]: !prev[props.node.id] }));
            }}
            onMouseDown={(e) => e.stopPropagation()}
            class={styles.iconBtn}
            classList={{ [styles.cursorOff]: isCursorOff() }}
          >
            <Show when={isCursorOff()} fallback={<CursorOnIcon />}>
              <CursorOffIcon />
            </Show>
          </span>
        </div>
      </div>

      {/* Children */}
      <Show when={props.isExpanded(props.node.id) && hasChildren()}>
        <For each={childNodes()}>
          {(child, idx) => {
            const isLast = () => idx() === childNodes().length - 1;
            const childLineage = () => [...props.lineageHasMoreSiblings, !isLast()];
            return (
              <TreeNode
                node={child}
                depth={props.depth + 1}
                lineageHasMoreSiblings={childLineage()}
                draggedId={props.draggedId}
                dropIndicator={props.dropIndicator}
                setDraggedId={props.setDraggedId}
                setDropIndicator={props.setDropIndicator}
                isExpanded={props.isExpanded}
                toggleExpanded={props.toggleExpanded}
                eyeOffMap={props.eyeOffMap}
                setEyeOffMap={props.setEyeOffMap}
                cursorOffMap={props.cursorOffMap}
                setCursorOffMap={props.setCursorOffMap}
              />
            );
          }}
        </For>
      </Show>
    </div>
  );
};
