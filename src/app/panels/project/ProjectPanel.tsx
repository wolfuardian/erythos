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
  path: string;
  selected: boolean;
  isSelected: (path: string) => boolean;
  onSelect: (path: string, modifier: { ctrl: boolean }) => void;
}

const TreeNode: Component<TreeNodeProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  const [hovered, setHovered] = createSignal(false);

  const isFolder = () => props.node.type === 'folder';

  const handleClick = (e: MouseEvent) => {
    if (isFolder()) {
      setExpanded(v => !v);
    } else {
      props.onSelect(props.path, { ctrl: e.ctrlKey || e.metaKey });
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
          background: props.selected
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
          color: props.selected ? 'var(--text-primary)' : 'var(--text-secondary)',
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
          {(child) => {
            const childPath = `${props.path}/${child.name}`;
            return (
              <TreeNode
                node={child}
                depth={props.depth + 1}
                path={childPath}
                selected={props.isSelected(childPath)}
                isSelected={props.isSelected}
                onSelect={props.onSelect}
              />
            );
          }}
        </For>
      </Show>
    </div>
  );
};

const ProjectPanel: Component = () => {
  const [selectedPaths, setSelectedPaths] = createSignal<Set<string>>(new Set());

  const isSelected = (path: string) => selectedPaths().has(path);

  const handleSelect = (path: string, modifier: { ctrl: boolean }) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (modifier.ctrl) {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      } else {
        next.clear();
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-panel)',
      padding: 'var(--space-xs) 0',
    }}>
      <For each={MOCK_TREE}>
        {(node) => (
          <TreeNode
            node={node}
            depth={0}
            path={node.name}
            selected={isSelected(node.name)}
            isSelected={isSelected}
            onSelect={handleSelect}
          />
        )}
      </For>
    </div>
  );
};

export default ProjectPanel;
