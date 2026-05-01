import { createSignal, For, Show, onMount, onCleanup, type Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { loadGLTFFromFile } from '../../utils/gltfLoader';
import type { SceneNode } from '../../core/scene/SceneFormat';
import { inferNodeType } from '../../core/scene/inferNodeType';
import { useEditor } from '../../app/EditorContext';
import { MoveNodeCommand } from '../../core/commands/MoveNodeCommand';
import { ContextMenu, type MenuItem } from '../../components/ContextMenu';
import { AddNodeCommand } from '../../core/commands/AddNodeCommand';
import { RemoveNodeCommand } from '../../core/commands/RemoveNodeCommand';
import { MultiCmdsCommand } from '../../core/commands/MultiCmdsCommand';
import { SaveAsPrefabCommand } from '../../core/commands/SaveAsPrefabCommand';
import { PanelHeader } from '../../components/PanelHeader';
import { useAreaState } from '../../app/areaState';
import {
  EyeOnIcon, EyeOffIcon, CursorOnIcon, CursorOffIcon,
  nodeTypeToIcon, nodeTypeColor,
} from './icons';

interface DropIndicator {
  targetId: string;
  position: 'before' | 'inside' | 'after';
}

interface TreeNodeProps {
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

const TreeNode: Component<TreeNodeProps> = (props) => {
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

const SceneTreePanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [draggedId, setDraggedId] = createSignal<string | null>(null);
  const [dropIndicator, setDropIndicator] = createSignal<DropIndicator | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);
  const [expandedMap, setExpandedMap] = useAreaState<Record<string, boolean>>('expandedMap', {});
  const [isFileDragging, setIsFileDragging] = createSignal(false);

  // Visual-only toggle state (P2/P3 will connect these to scene model)
  const [eyeOffMap, setEyeOffMap] = createSignal<Record<string, boolean>>({});
  const [cursorOffMap, setCursorOffMap] = createSignal<Record<string, boolean>>({});

  const isExpanded = (id: string): boolean => expandedMap()[id] ?? false;

  const toggleExpanded = (id: string): void => {
    setExpandedMap(prev => ({ ...prev, [id]: !(prev[id] ?? false) }));
  };

  const setNodeExpanded = (id: string, value: boolean): void => {
    setExpandedMap(prev => ({ ...prev, [id]: value }));
  };

  const flatVisibleNodes = (): SceneNode[] => {
    const result: SceneNode[] = [];
    const visit = (parentId: string | null) => {
      const children = bridge.nodes()
        .filter(n => n.parent === parentId)
        .sort((a, b) => a.order - b.order);
      for (const child of children) {
        result.push(child);
        if (isExpanded(child.id)) {
          visit(child.id);
        }
      }
    };
    visit(null);
    return result;
  };

  const rootNodes = () =>
    bridge.nodes()
      .filter(n => n.parent === null)
      .sort((a, b) => a.order - b.order);

  const createPrimitive = (type: string, name: string) => {
    const node = editor.sceneDocument.createNode(name);
    node.components = {
      geometry: { type },
      material: { color: 0xcccccc },
    };
    editor.execute(new AddNodeCommand(editor, node));
    editor.selection.select(node.id);
  };

  const collectSubtree = (rootId: string): SceneNode[] => {
    const all = editor.sceneDocument.getAllNodes();
    const result: SceneNode[] = [];
    const queue = [rootId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const node = editor.sceneDocument.getNode(cur);
      if (node) {
        result.push(node);
        all.filter(n => n.parent === cur).forEach(n => queue.push(n.id));
      }
    }
    return result;
  };

  const menuItems = (): MenuItem[] => {
    const selected = bridge.selectedUUIDs();
    const hasClip = bridge.hasClipboard();
    return [
      {
        label: 'Create Empty',
        action: () => {
          const node = editor.sceneDocument.createNode('Empty');
          editor.execute(new AddNodeCommand(editor, node));
          editor.selection.select(node.id);
        },
      },
      {
        label: 'Create Primitive',
        children: [
          { label: 'Box', action: () => createPrimitive('box', 'Box') },
          { label: 'Sphere', action: () => createPrimitive('sphere', 'Sphere') },
          { label: 'Plane', action: () => createPrimitive('plane', 'Plane') },
          { label: 'Cylinder', action: () => createPrimitive('cylinder', 'Cylinder') },
        ],
      },
      {
        label: 'Delete',
        disabled: selected.length === 0,
        action: () => {
          const ids = bridge.selectedUUIDs();
          const topLevel = ids.filter(id => {
            let cursor = editor.sceneDocument.getNode(id)?.parent;
            while (cursor) {
              if (ids.includes(cursor)) return false;
              cursor = editor.sceneDocument.getNode(cursor)?.parent ?? null;
            }
            return true;
          });
          if (topLevel.length === 1) {
            editor.execute(new RemoveNodeCommand(editor, topLevel[0]));
          } else if (topLevel.length > 1) {
            const cmds = topLevel.map(id => new RemoveNodeCommand(editor, id));
            editor.execute(new MultiCmdsCommand(editor, cmds));
          }
          editor.selection.select(null);
        },
      },
      {
        label: 'Save as Prefab',
        disabled: selected.length !== 1,
        action: () => {
          const uuid = selected[0];
          const node = editor.sceneDocument.getNode(uuid);
          if (!node) return;
          editor.execute(new SaveAsPrefabCommand(editor, uuid, node.name));
        },
      },
      {
        label: 'Copy',
        disabled: selected.length === 0,
        action: () => {
          const topLevel = selected.filter(id => {
            let cursor = editor.sceneDocument.getNode(id)?.parent;
            while (cursor) {
              if (selected.includes(cursor)) return false;
              cursor = editor.sceneDocument.getNode(cursor)?.parent ?? null;
            }
            return true;
          });
          const allNodes = topLevel.flatMap(id => collectSubtree(id));
          editor.clipboard.copy(allNodes);
        },
      },
      {
        label: 'Cut',
        disabled: selected.length === 0,
        action: () => {
          const topLevel = selected.filter(id => {
            let cursor = editor.sceneDocument.getNode(id)?.parent;
            while (cursor) {
              if (selected.includes(cursor)) return false;
              cursor = editor.sceneDocument.getNode(cursor)?.parent ?? null;
            }
            return true;
          });
          const allNodes = topLevel.flatMap(id => collectSubtree(id));
          editor.clipboard.cut(allNodes);
          if (topLevel.length === 1) {
            editor.execute(new RemoveNodeCommand(editor, topLevel[0]));
          } else if (topLevel.length > 1) {
            const cmds = topLevel.map(id => new RemoveNodeCommand(editor, id));
            editor.execute(new MultiCmdsCommand(editor, cmds));
          }
          editor.selection.select(null);
        },
      },
      {
        label: 'Paste',
        disabled: !hasClip,
        action: () => {
          const nodes = editor.clipboard.paste();
          if (!nodes || nodes.length === 0) return;

          const selected = bridge.selectedUUIDs();
          if (selected.length === 1) {
            const parentId = selected[0];
            const existingChildren = bridge.nodes().filter(n => n.parent === parentId);
            const maxOrder = existingChildren.length > 0
              ? Math.max(...existingChildren.map(n => n.order))
              : -1;
            let offset = 1;
            for (const node of nodes) {
              if (node.parent === null) {
                node.parent = parentId;
                node.order = maxOrder + offset;
                offset++;
              }
            }
          }

          const cmds = nodes.map(n => new AddNodeCommand(editor, n));
          if (cmds.length === 1) {
            editor.execute(cmds[0]);
          } else {
            editor.execute(new MultiCmdsCommand(editor, cmds));
          }
          editor.selection.select(null);
          for (const n of nodes) {
            editor.selection.add(n.id);
          }
        },
      },
    ];
  };

  let containerRef!: HTMLDivElement;

  onMount(() => {
    const panelEl = containerRef;

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setIsFileDragging(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!panelEl.contains(e.relatedTarget as Node)) {
        setIsFileDragging(false);
      }
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsFileDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const gltfFile = files.find(f => /\.(glb|gltf)$/i.test(f.name));
      if (!gltfFile) return;
      try {
        await loadGLTFFromFile(gltfFile, editor);
      } catch (err) {
        console.error('Failed to import GLB:', err);
      }
    };

    panelEl.addEventListener('dragover', onDragOver);
    panelEl.addEventListener('dragenter', onDragEnter);
    panelEl.addEventListener('dragleave', onDragLeave);
    panelEl.addEventListener('drop', onDrop);

    onCleanup(() => {
      panelEl.removeEventListener('dragover', onDragOver);
      panelEl.removeEventListener('dragenter', onDragEnter);
      panelEl.removeEventListener('dragleave', onDragLeave);
      panelEl.removeEventListener('drop', onDrop);
    });
  });

  return (
    <div
      data-testid="scene-tree-panel"
      style={{
        width: 'calc(100% - 6px)',
        height: 'calc(100% - 6px)',
        display: 'flex',
        'flex-direction': 'column',
        overflow: 'hidden',
        background: 'var(--bg-panel)',
        'box-shadow': 'var(--shadow-well-outer)',
        'border-radius': 'var(--radius-lg)',
        margin: '3px',
        'box-sizing': 'border-box',
      }}>
      {/* Header */}
      <PanelHeader title="Scene" />

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) return;

          const flat = flatVisibleNodes();
          const selected = bridge.selectedUUIDs();
          const currentId = selected.length > 0 ? selected[selected.length - 1] : null;
          const currentIdx = currentId ? flat.findIndex(n => n.id === currentId) : -1;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = flat[currentIdx + 1];
            if (next) editor.selection.select(next.id);
            else if (currentIdx === -1 && flat.length > 0) editor.selection.select(flat[0].id);
          }

          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentIdx > 0) editor.selection.select(flat[currentIdx - 1].id);
          }

          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (!currentId) return;
            const node = flat.find(n => n.id === currentId);
            if (!node) return;
            const hasKids = bridge.nodes().some(n => n.parent === currentId);
            if (hasKids && isExpanded(currentId)) {
              setNodeExpanded(currentId, false);
            } else if (node.parent) {
              editor.selection.select(node.parent);
            }
          }

          if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (!currentId) return;
            const hasKids = bridge.nodes().some(n => n.parent === currentId);
            if (!hasKids) return;
            if (!isExpanded(currentId)) {
              setNodeExpanded(currentId, true);
            } else {
              const children = bridge.nodes()
                .filter(n => n.parent === currentId)
                .sort((a, b) => a.order - b.order);
              if (children.length > 0) editor.selection.select(children[0].id);
            }
          }
        }}
        onClick={(e) => {
          if (!(e.target as Element).closest('[draggable]')) {
            editor.selection.select(null);
          }
          containerRef.focus();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!(e.target as Element).closest('[draggable]')) {
            editor.selection.select(null);
          }
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{
          position: 'relative',
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-xs) 0',
          outline: 'none',
        }}
      >
        <For each={rootNodes()}>
          {(node) => (
            <TreeNode
              node={node}
              depth={0}
              lineageHasMoreSiblings={[]}
              draggedId={draggedId}
              dropIndicator={dropIndicator}
              setDraggedId={setDraggedId}
              setDropIndicator={setDropIndicator}
              isExpanded={isExpanded}
              toggleExpanded={toggleExpanded}
              eyeOffMap={eyeOffMap}
              setEyeOffMap={setEyeOffMap}
              cursorOffMap={cursorOffMap}
              setCursorOffMap={setCursorOffMap}
            />
          )}
        </For>
        <Show when={rootNodes().length === 0}>
          <div style={{
            padding: 'var(--space-xl)',
            color: 'var(--text-muted)',
            'font-size': 'var(--font-size-sm)',
            'text-align': 'center',
          }}>
            Empty scene
          </div>
        </Show>
        <Show when={contextMenu()}>
          <ContextMenu
            items={menuItems()}
            position={contextMenu()!}
            onClose={() => setContextMenu(null)}
            align={{ itemIndex: 0, xPercent: 0.65 }}
          />
        </Show>
        <Show when={isFileDragging()}>
          <div style={{
            position: 'absolute',
            inset: '0',
            background: 'rgba(100, 149, 237, 0.15)',
            border: '2px dashed rgba(100, 149, 237, 0.6)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            color: 'var(--text-secondary, #aaa)',
            'font-size': '13px',
            'pointer-events': 'none',
            'z-index': '10',
            'border-radius': '4px',
          }}>
            Drop GLB to import
          </div>
        </Show>
      </div>
    </div>
  );
};

export default SceneTreePanel;
