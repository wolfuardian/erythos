import { createSignal, For, Show, type Component } from 'solid-js';
import type { SceneNode } from '../../core/scene/SceneFormat';
import { inferNodeType } from '../../core/scene/inferNodeType';
import { useEditor } from '../../app/EditorContext';
import { MoveNodeCommand } from '../../core/commands/MoveNodeCommand';
import { ContextMenu, type MenuItem } from '../../components/ContextMenu';
import { AddNodeCommand } from '../../core/commands/AddNodeCommand';
import { RemoveNodeCommand } from '../../core/commands/RemoveNodeCommand';
import { MultiCmdsCommand } from '../../core/commands/MultiCmdsCommand';

interface DropIndicator {
  targetId: string;
  position: 'before' | 'inside' | 'after';
}

interface TreeNodeProps {
  node: SceneNode;
  depth: number;
  draggedId: () => string | null;
  dropIndicator: () => DropIndicator | null;
  setDraggedId: (id: string | null) => void;
  setDropIndicator: (v: DropIndicator | null) => void;
}

const TreeNode: Component<TreeNodeProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [expanded, setExpanded] = createSignal(true);

  const isSelected = () => bridge.selectedUUIDs().includes(props.node.id);
  const isHovered = () => bridge.hoveredUUID() === props.node.id;

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

  const typeBadge = () => {
    switch (inferNodeType(props.node)) {
      case 'Group':             return { label: 'G', color: 'var(--badge-group)' };
      case 'Mesh':              return { label: 'M', color: 'var(--badge-mesh, #4a9eff)' };
      case 'Box':               return { label: 'B', color: 'var(--badge-geometry, #f5a623)' };
      case 'Sphere':            return { label: 'S', color: 'var(--badge-geometry, #f5a623)' };
      case 'Plane':             return { label: 'P', color: 'var(--badge-geometry, #f5a623)' };
      case 'Cylinder':          return { label: 'C', color: 'var(--badge-geometry, #f5a623)' };
      case 'DirectionalLight':  return { label: 'L', color: 'var(--badge-light, #f7dc6f)' };
      case 'AmbientLight':      return { label: 'L', color: 'var(--badge-light, #f7dc6f)' };
      case 'PerspectiveCamera': return { label: 'C', color: 'var(--badge-camera, #a29bfe)' };
      default:                  return { label: 'O', color: 'var(--badge-empty)' };
    }
  };

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

  return (
    <div>
      <div
        draggable={true}
        onClick={handleClick}
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
          'padding-left': `${8 + props.depth * 16}px`,
          cursor: 'pointer',
          background: rowBackground(),
          'border-radius': 'var(--radius-sm)',
          opacity: props.draggedId() === props.node.id ? 0.4 : 1,
          'user-select': 'none',
        }}
      >
        {/* Drop indicator: before */}
        <Show when={isDropTarget() && indicator()?.position === 'before'}>
          <div style={{
            position: 'absolute',
            top: '0',
            left: `${8 + props.depth * 16}px`,
            right: '0',
            height: '2px',
            background: 'var(--accent-primary, #4a9eff)',
            'pointer-events': 'none',
          }} />
        </Show>

        {/* Drop indicator: after */}
        <Show when={isDropTarget() && indicator()?.position === 'after'}>
          <div style={{
            position: 'absolute',
            bottom: '0',
            left: `${8 + props.depth * 16}px`,
            right: '0',
            height: '2px',
            background: 'var(--accent-primary, #4a9eff)',
            'pointer-events': 'none',
          }} />
        </Show>

        {/* Expand toggle */}
        <Show when={hasChildren()}>
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded()); }}
            style={{
              width: '14px',
              'font-size': '8px',
              color: 'var(--text-muted)',
              'text-align': 'center',
              'flex-shrink': 0,
              'user-select': 'none',
            }}
          >
            {expanded() ? '\u25BC' : '\u25B6'}
          </span>
        </Show>
        <Show when={!hasChildren()}>
          <span style={{ width: '14px', 'flex-shrink': 0 }} />
        </Show>

        {/* Type badge */}
        <span style={{
          width: '16px',
          height: '16px',
          'border-radius': 'var(--radius-sm)',
          background: typeBadge().color,
          color: 'var(--text-inverse)',
          'font-size': 'var(--font-size-xs)',
          'font-weight': 'bold',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'margin-right': 'var(--space-sm)',
          'flex-shrink': 0,
        }}>
          {typeBadge().label}
        </span>

        {/* Name */}
        <span style={{
          'font-size': 'var(--font-size-md)',
          color: isSelected() ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}>
          {props.node.name}
        </span>
      </div>

      {/* Children */}
      <Show when={expanded() && hasChildren()}>
        <For each={childNodes()}>
          {(child) => (
            <TreeNode
              node={child}
              depth={props.depth + 1}
              draggedId={props.draggedId}
              dropIndicator={props.dropIndicator}
              setDraggedId={props.setDraggedId}
              setDropIndicator={props.setDropIndicator}
            />
          )}
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
        label: 'Copy',
        disabled: selected.length === 0,
        action: () => {
          const nodes = selected
            .map(id => editor.sceneDocument.getNode(id))
            .filter((n): n is SceneNode => n !== null);
          editor.clipboard.copy(nodes);
        },
      },
      {
        label: 'Cut',
        disabled: selected.length === 0,
        action: () => {
          const nodes = selected
            .map(id => editor.sceneDocument.getNode(id))
            .filter((n): n is SceneNode => n !== null);
          editor.clipboard.cut(nodes);
          if (selected.length === 1) {
            editor.execute(new RemoveNodeCommand(editor, selected[0]));
          } else {
            const cmds = selected.map(id => new RemoveNodeCommand(editor, id));
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

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX - 104, y: e.clientY - 15 });
      }}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'var(--bg-panel)',
        padding: 'var(--space-xs) 0',
      }}
    >
      <For each={rootNodes()}>
        {(node) => (
          <TreeNode
            node={node}
            depth={0}
            draggedId={draggedId}
            dropIndicator={dropIndicator}
            setDraggedId={setDraggedId}
            setDropIndicator={setDropIndicator}
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
        />
      </Show>
    </div>
  );
};

export default SceneTreePanel;
