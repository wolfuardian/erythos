import { createSignal, For, Show, type Component } from 'solid-js';

// Static mock data — replace with ProjectManager signals once #32 merges
interface FileNode {
  name: string;
  type: 'folder' | 'file';
  ext?: string;
  children?: FileNode[];
}

const MOCK_TREE: FileNode[] = [
  {
    name: 'models',
    type: 'folder',
    children: [
      { name: 'character.glb', type: 'file', ext: 'glb' },
      { name: 'environment.glb', type: 'file', ext: 'glb' },
      {
        name: 'props',
        type: 'folder',
        children: [
          { name: 'chair.glb', type: 'file', ext: 'glb' },
          { name: 'table.glb', type: 'file', ext: 'glb' },
        ],
      },
    ],
  },
  {
    name: 'textures',
    type: 'folder',
    children: [
      { name: 'diffuse.png', type: 'file', ext: 'png' },
      { name: 'normal.png', type: 'file', ext: 'png' },
    ],
  },
  { name: 'scene.json', type: 'file', ext: 'json' },
];

function extBadge(ext: string | undefined): { label: string; color: string } {
  switch (ext) {
    case 'glb':
    case 'gltf': return { label: 'G', color: 'var(--badge-mesh)' };
    case 'png':
    case 'jpg':
    case 'jpeg': return { label: 'T', color: 'var(--badge-light)' };
    case 'json': return { label: 'J', color: 'var(--badge-camera)' };
    default:     return { label: 'F', color: 'var(--badge-empty)' };
  }
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
}

const TreeNode: Component<TreeNodeProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  const [selected, setSelected] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);

  const isFolder = () => props.node.type === 'folder';

  const handleClick = () => {
    if (isFolder()) {
      setExpanded(v => !v);
    } else {
      setSelected(v => !v);
    }
  };

  const badge = () => isFolder()
    ? { label: expanded() ? '▾' : '▸', color: 'var(--badge-group)' }
    : extBadge(props.node.ext);

  return (
    <div>
      <div
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          'align-items': 'center',
          height: 'var(--row-height)',
          'padding-left': `${8 + props.depth * 16}px`,
          cursor: 'pointer',
          background: selected()
            ? 'var(--bg-selected)'
            : hovered()
            ? 'var(--bg-hover)'
            : 'transparent',
          'border-radius': 'var(--radius-sm)',
        }}
      >
        {/* Badge */}
        <span style={{
          width: '16px',
          height: '16px',
          'border-radius': 'var(--radius-sm)',
          background: badge().color,
          color: isFolder() ? 'var(--text-secondary)' : 'var(--text-inverse)',
          'font-size': isFolder() ? '10px' : 'var(--font-size-xs)',
          'font-weight': 'bold',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'margin-right': 'var(--space-sm)',
          'flex-shrink': 0,
        }}>
          {badge().label}
        </span>

        {/* Name */}
        <span style={{
          'font-size': 'var(--font-size-md)',
          color: selected() ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}>
          {props.node.name}
        </span>
      </div>

      {/* Children */}
      <Show when={isFolder() && expanded() && props.node.children}>
        <For each={props.node.children}>
          {(child) => <TreeNode node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  );
};

const ProjectPanel: Component = () => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-xs) 0',
    }}>
      <For each={MOCK_TREE}>
        {(node) => <TreeNode node={node} depth={0} />}
      </For>
    </div>
  );
};

export default ProjectPanel;
