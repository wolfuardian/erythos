import { createSignal, For, Show, type Component } from 'solid-js';
import type { SceneNode } from '../../core/scene/SceneFormat';
import { inferNodeType } from '../../core/scene/inferNodeType';
import { useEditor } from '../../app/EditorContext';

interface TreeNodeProps {
  node: SceneNode;
  depth: number;
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

  return (
    <div>
      <div
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'flex',
          'align-items': 'center',
          height: 'var(--row-height)',
          'padding-left': `${8 + props.depth * 16}px`,
          cursor: 'pointer',
          background: isSelected()
            ? 'var(--bg-selected)'
            : isHovered()
            ? 'var(--bg-hover)'
            : 'transparent',
          'border-radius': 'var(--radius-sm)',
        }}
      >
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
          {(child) => <TreeNode node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  );
};

const SceneTreePanel: Component = () => {
  const bridge = useEditor();

  const rootNodes = () =>
    bridge.nodes()
      .filter(n => n.parent === null)
      .sort((a, b) => a.order - b.order);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-xs) 0',
    }}>
      <For each={rootNodes()}>
        {(node) => <TreeNode node={node} depth={0} />}
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
    </div>
  );
};

export default SceneTreePanel;
