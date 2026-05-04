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

export interface DropIndicator {
  targetId: string;
  position: 'before' | 'inside' | 'after';
}

export interface TreeNodeProps {
  node: SceneNode;
  depth: number;
  /** For each ancestor depth 0..depth-1, whether that ancestor still has more siblings after it.
   *  Used to decide which indent guide lines to draw continuously vs stopping. */
  lineageHasMoreSiblings: boolean[];
  draggedId: () => string | null;
  dropIndicator: () => DropIndicator | null;
  setDraggedId: (id: string | null) => void;
  setDropIndicator: (v: DropIndicator | null) => void;
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string) => void;
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
  const isHovered = () => bridge.hoveredUUID() === props.node.id;

  const isEyeOff = () => props.eyeOffMap()[props.node.id] ?? false;
  const isCursorOff = () => props.cursorOffMap()[props.node.id] ?? false;

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
    let cursor: string | null = props.node.id;
    while (cursor !== null) {
      if (cursor === dragId) return;
      const n = nodes.find(n => n.id === cursor);
      cursor = n?.parent ?? null;
    }

    let newParentId: string | null;
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

  const rowBackground = () => {
    if (isDropTarget() && indicator()?.position === 'inside') {
      return 'var(--bg-drop-target, rgba(74, 158, 255, 0.15))';
    }
    if (isSelected()) return 'var(--bg-selected)';
    if (isHovered()) return 'var(--bg-hover)';
    return 'transparent';
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
        style={{
          position: 'relative',
          display: 'flex',
          'align-items': 'center',
          height: 'var(--row-height)',
          'padding-left': `${contentLeft()}px`,
          cursor: 'pointer',
          background: rowBackground(),
          'border-radius': 'var(--radius-sm)',
          margin: '0 4px',
          opacity: props.draggedId() === props.node.id ? 0.4 : 1,
          'user-select': 'none',
        }}
      >
        {/* Selected: left 2px accent bar */}
        <Show when={isSelected()}>
          <div
            style={{
              position: 'absolute',
              left: '0',
              top: '4px',
              bottom: '4px',
              width: '2px',
              background: 'var(--accent-blue)',
              'border-radius': '1px',
              'pointer-events': 'none',
            }}
          />
        </Show>

        {/* Indent guide lines */}
        <For each={props.lineageHasMoreSiblings}>
          {(hasMore, i) => (
            <Show when={hasMore}>
              <div
                style={{
                  position: 'absolute',
                  left: `${ROW_PADDING_LEFT + i() * INDENT_W + 6}px`,
                  top: '0',
                  bottom: '0',
                  width: '1px',
                  background: 'var(--border-subtle)',
                  opacity: '0.5',
                  'pointer-events': 'none',
                }}
              />
            </Show>
          )}
        </For>

        {/* Drop indicator: before */}
        <Show when={isDropTarget() && indicator()?.position === 'before'}>
          <div style={{
            position: 'absolute',
            top: '0',
            left: `${contentLeft()}px`,
            right: '0',
            height: '2px',
            background: 'var(--accent-blue)',
            'pointer-events': 'none',
          }} />
        </Show>

        {/* Drop indicator: after */}
        <Show when={isDropTarget() && indicator()?.position === 'after'}>
          <div style={{
            position: 'absolute',
            bottom: '0',
            left: `${contentLeft()}px`,
            right: '0',
            height: '2px',
            background: 'var(--accent-blue)',
            'pointer-events': 'none',
          }} />
        </Show>

        {/* Expand toggle */}
        <Show when={hasChildren()}>
          <span
            data-testid="scene-tree-row-expand"
            onClick={(e) => { e.stopPropagation(); props.toggleExpanded(props.node.id); }}
            style={{
              width: '14px',
              'font-size': '7px',
              color: 'var(--text-muted)',
              'text-align': 'center',
              'flex-shrink': 0,
              'user-select': 'none',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              opacity: '0.6',
            }}
          >
            {props.isExpanded(props.node.id) ? '▼' : '▶'}
          </span>
        </Show>
        <Show when={!hasChildren()}>
          <span style={{ width: '14px', 'flex-shrink': 0 }} />
        </Show>

        {/* Type icon (SVG) — dims when eye-off (0.38) or cursor-off (0.45) */}
        <span
          data-testid="scene-tree-row-icon"
          style={{
            width: '13px',
            height: '13px',
            'flex-shrink': 0,
            'margin-right': '5px',
            display: 'inline-flex',
            'align-items': 'center',
            'justify-content': 'center',
            opacity: isEyeOff() ? 0.38 : isCursorOff() ? 0.45 : 1,
          }}
        >
          <Dynamic component={nodeTypeToIcon(nodeType())} color={iconColor()} size={13} />
        </span>

        {/* Name — dims when eye-off (0.38) or cursor-off (0.45) */}
        <span
          data-testid="scene-tree-row-name"
          style={{
            'font-size': 'var(--font-size-sm)',
            color: isSelected() ? 'var(--text-primary)' : 'var(--text-secondary)',
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
            flex: '1',
            'min-width': '0',
            opacity: isEyeOff() ? 0.38 : isCursorOff() ? 0.45 : 1,
          }}
        >
          {props.node.name}
        </span>

        {/* Toggle column: eye + cursor — always visible */}
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '2px',
            'flex-shrink': 0,
            'padding-right': '6px',
          }}
        >
          {/* Eye toggle */}
          <span
            data-testid="scene-tree-row-eye"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              props.setEyeOffMap(prev => ({ ...prev, [props.node.id]: !prev[props.node.id] }));
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '18px',
              height: '18px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'border-radius': 'var(--radius-sm)',
              'flex-shrink': 0,
              cursor: 'pointer',
              color: isEyeOff() ? 'var(--text-disabled)' : 'var(--text-muted)',
              opacity: isEyeOff() ? 0.45 : 0.9,
            }}
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
            style={{
              width: '18px',
              height: '18px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'border-radius': 'var(--radius-sm)',
              'flex-shrink': 0,
              cursor: 'pointer',
              color: isCursorOff() ? 'var(--text-disabled)' : 'var(--text-muted)',
              opacity: isCursorOff() ? 0.45 : 0.9,
            }}
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
