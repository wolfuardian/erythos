import { createMemo, type Component } from 'solid-js';
import { MathUtils } from 'three';
import { useEditor } from '../../../app/EditorContext';
import type { SceneNode } from '../../../core/scene/SceneFormat';
import FoldableSection from '../components/FoldableSection';
import { XYZCellReadonly } from '../components/XYZCell';
import { fieldRow, fieldLabel } from '../components/fieldStyles';

interface MultiSelectDrawProps {
  uuids: string[];
}

const MIXED = '\u2014';
type Axis = 'x' | 'y' | 'z';
const AXES: Axis[] = ['x', 'y', 'z'];

function commonStr(nodes: SceneNode[], get: (n: SceneNode) => string): string {
  const v = get(nodes[0]);
  for (let i = 1; i < nodes.length; i++) {
    if (get(nodes[i]) !== v) return MIXED;
  }
  return v;
}

function commonNum(nodes: SceneNode[], get: (n: SceneNode) => number): string {
  const v = round(get(nodes[0]));
  for (let i = 1; i < nodes.length; i++) {
    if (round(get(nodes[i])) !== v) return MIXED;
  }
  return String(v);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

const rowStyle = {
  display: 'flex',
  'align-items': 'center',
  gap: '5px',
  height: '22px',
} as const;

const labelBaseStyle = {
  'font-size': '10px',
  width: '62px',
  'flex-shrink': '0',
  'text-align': 'right' as const,
  'white-space': 'nowrap' as const,
  'letter-spacing': '.01em',
  'line-height': '22px',
  'padding-right': '2px',
} as const;

const GROUP_LABELS: Record<string, string> = {
  position: 'Position',
  rotation: 'Rotation',
  scale: 'Scale',
};

const groupSepStyle = { height: '4px' } as const;

const MultiSelectDraw: Component<MultiSelectDrawProps> = (props) => {
  const bridge = useEditor();

  const info = createMemo(() => {
    bridge.objectVersion();
    const nodes = props.uuids
      .map((uuid) => bridge.getNode(uuid))
      .filter((n): n is SceneNode => n !== null);
    if (nodes.length === 0) return null;
    return {
      name: commonStr(nodes, (n) => n.name),
      px: commonNum(nodes, (n) => n.position[0]),
      py: commonNum(nodes, (n) => n.position[1]),
      pz: commonNum(nodes, (n) => n.position[2]),
      rx: commonNum(nodes, (n) => MathUtils.radToDeg(n.rotation[0])),
      ry: commonNum(nodes, (n) => MathUtils.radToDeg(n.rotation[1])),
      rz: commonNum(nodes, (n) => MathUtils.radToDeg(n.rotation[2])),
      sx: commonNum(nodes, (n) => n.scale[0]),
      sy: commonNum(nodes, (n) => n.scale[1]),
      sz: commonNum(nodes, (n) => n.scale[2]),
    };
  });

  const transformValues: Record<string, Record<Axis, () => string>> = {
    position: {
      x: () => info()?.px ?? MIXED,
      y: () => info()?.py ?? MIXED,
      z: () => info()?.pz ?? MIXED,
    },
    rotation: {
      x: () => info()?.rx ?? MIXED,
      y: () => info()?.ry ?? MIXED,
      z: () => info()?.rz ?? MIXED,
    },
    scale: {
      x: () => info()?.sx ?? MIXED,
      y: () => info()?.sy ?? MIXED,
      z: () => info()?.sz ?? MIXED,
    },
  };

  const renderGroup = (group: string, isLast: boolean) => (
    <>
      {AXES.map((axis, i) => (
        <div style={rowStyle}>
          <span style={{
            ...labelBaseStyle,
            color: i === 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
          }}>
            {i === 0 ? `${GROUP_LABELS[group]} ${axis.toUpperCase()}` : axis.toUpperCase()}
          </span>
          <div style={{ flex: '1', 'border-left': '2px solid transparent', 'border-radius': '0 3px 3px 0', overflow: 'hidden', display: 'flex' }}>
            <XYZCellReadonly axis={axis} value={transformValues[group][axis]()} />
          </div>
        </div>
      ))}
      {!isLast && <div style={groupSepStyle} />}
    </>
  );

  return (
    <>
      {/* 多選摘要 */}
      <div style={{
        color: 'var(--text-secondary)',
        'font-size': 'var(--font-size-sm)',
        'text-align': 'center',
        'margin-bottom': 'var(--space-lg)',
      }}>
        {props.uuids.length} objects selected
      </div>

      <FoldableSection sectionKey="object" label="OBJECT">
        <div style={fieldRow}>
          <label style={fieldLabel}>Name</label>
          <span style={{
            'font-size': 'var(--font-size-sm)',
            'font-weight': '500',
            color: info()?.name === MIXED ? 'var(--text-muted)' : 'var(--text-primary)',
          }}>
            {info()?.name ?? MIXED}
          </span>
        </div>
      </FoldableSection>

      <FoldableSection sectionKey="transform" label="TRANSFORM">
        {renderGroup('position', false)}
        {renderGroup('rotation', false)}
        {renderGroup('scale', true)}
      </FoldableSection>
    </>
  );
};

export default MultiSelectDraw;
