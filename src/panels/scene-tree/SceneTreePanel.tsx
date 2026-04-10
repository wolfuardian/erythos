import { createSignal, createEffect, For, Show, type Component } from 'solid-js';
import type { Object3D } from 'three';
import { useEditor } from '../../app/EditorContext';

interface TreeNodeProps {
  object: Object3D;
  depth: number;
}

const TreeNode: Component<TreeNodeProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [expanded, setExpanded] = createSignal(true);

  const isSelected = () => bridge.selectedObjects().includes(props.object);
  const isHovered = () => bridge.hoveredObject() === props.object;
  const hasChildren = () => props.object.children.length > 0;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      editor.selection.toggle(props.object);
    } else {
      if (isSelected()) {
        editor.selection.select(null);
      } else {
        editor.selection.select(props.object);
      }
    }
  };

  const handleMouseEnter = () => editor.selection.hover(props.object);
  const handleMouseLeave = () => editor.selection.hover(null);

  const typeBadge = () => {
    const t = props.object.type;
    if (t.includes('Light')) return { label: 'L', color: 'var(--badge-light)' };
    if (t.includes('Camera')) return { label: 'C', color: 'var(--badge-camera)' };
    if (t === 'Mesh') return { label: 'M', color: 'var(--badge-mesh)' };
    if (t === 'Group') return { label: 'G', color: 'var(--badge-group)' };
    return { label: 'O', color: 'var(--badge-empty)' };
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
          {props.object.name || props.object.type}
        </span>
      </div>

      {/* Children */}
      <Show when={expanded() && hasChildren()}>
        <For each={props.object.children}>
          {(child) => <TreeNode object={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  );
};

const SceneTreePanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [children, setChildren] = createSignal<Object3D[]>([]);

  createEffect(() => {
    bridge.sceneVersion();
    setChildren([...editor.scene.children]);
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-xs) 0',
    }}>
      <For each={children()}>
        {(child) => <TreeNode object={child} depth={0} />}
      </For>
      <Show when={children().length === 0}>
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
