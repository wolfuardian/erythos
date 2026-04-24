import { createMemo, type Component } from 'solid-js';
import { MathUtils } from 'three';
import { useEditor } from '../../../app/EditorContext';
import type { SceneNode } from '../../../core/scene/SceneFormat';
import FoldableSection from '../components/FoldableSection';
import { XYZCellReadonly } from '../components/XYZCell';
import { fieldRow, fieldLabel, xyzRow, groupLabelRow } from '../components/fieldStyles';

interface MultiSelectDrawProps {
  uuids: string[];
}

const MIXED = '\u2014'; // em dash

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

  return (
    <>
      {/* 多選摘要 */}
      <div data-devid="multi-select-draw" style={{
        color: 'var(--text-secondary)',
        'font-size': 'var(--font-size-sm)',
        'text-align': 'center',
        'margin-bottom': 'var(--space-lg)',
      }}>
        {props.uuids.length} objects selected
      </div>

      {/* OBJECT section — 共用 sectionKey，折疊狀態與單選同步 */}
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

      {/* TRANSFORM section — 共用 sectionKey */}
      <FoldableSection sectionKey="transform" label="TRANSFORM">
        <div style={groupLabelRow}>
          <span style={fieldLabel}>Position</span>
          <div style={xyzRow}>
            <XYZCellReadonly axis="x" value={info()?.px ?? MIXED} />
            <XYZCellReadonly axis="y" value={info()?.py ?? MIXED} />
            <XYZCellReadonly axis="z" value={info()?.pz ?? MIXED} />
          </div>
        </div>

        <div style={groupLabelRow}>
          <span style={fieldLabel}>Rotation</span>
          <div style={xyzRow}>
            <XYZCellReadonly axis="x" value={info()?.rx ?? MIXED} />
            <XYZCellReadonly axis="y" value={info()?.ry ?? MIXED} />
            <XYZCellReadonly axis="z" value={info()?.rz ?? MIXED} />
          </div>
        </div>

        <div style={groupLabelRow}>
          <span style={fieldLabel}>Scale</span>
          <div style={xyzRow}>
            <XYZCellReadonly axis="x" value={info()?.sx ?? MIXED} />
            <XYZCellReadonly axis="y" value={info()?.sy ?? MIXED} />
            <XYZCellReadonly axis="z" value={info()?.sz ?? MIXED} />
          </div>
        </div>
      </FoldableSection>
    </>
  );
};

export default MultiSelectDraw;
