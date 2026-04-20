import { createSignal, createEffect, type Component } from 'solid-js';
import { MathUtils } from 'three';
import { useEditor } from '../../../app/EditorContext';
import { SetTransformCommand } from '../../../core/commands/SetTransformCommand';
import type { Vec3 } from '../../../core/scene/SceneFormat';
import FoldableSection from '../components/FoldableSection';
import { XYZCellReadonly } from '../components/XYZCell';
import { NumberDrag } from '../../../components/NumberDrag';

interface TransformDrawProps {
  uuid: string;
}

const axisToIndex = { x: 0, y: 1, z: 2 } as const;
type Axis = 'x' | 'y' | 'z';
const AXES: Axis[] = ['x', 'y', 'z'];

const AXIS_COLOR: Record<Axis, string> = {
  x: '#c04040',
  y: '#3a9060',
  z: '#527fc8',
};

const GROUP_LABELS: Record<string, string> = {
  position: 'Position',
  rotation: 'Rotation',
  scale: 'Scale',
};

// ── Row 樣式 ────────────────────────────────────
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

const groupSepStyle = { height: '4px' } as const;

interface AxisRowProps {
  group: string;
  axis: Axis;
  isFirst: boolean;
  value: number;
  onChange: (v: number) => void;
  step: number;
  precision: number;
  min?: number;
  onDragEnd: () => void;
}

const AxisRow: Component<AxisRowProps> = (props) => {
  const [hovered, setHovered] = createSignal(false);

  const labelText = () =>
    props.isFirst ? `${GROUP_LABELS[props.group]} ${props.axis.toUpperCase()}` : props.axis.toUpperCase();

  const labelColor = () =>
    props.isFirst ? 'var(--text-secondary)' : 'var(--text-muted)';

  const cellStyle = () => ({
    flex: '1',
    'border-left': `2px solid ${hovered() ? AXIS_COLOR[props.axis] : 'transparent'}`,
    'border-radius': '0 3px 3px 0',
    background: hovered() ? 'var(--bg-hover)' : undefined,
    overflow: 'hidden' as const,
    display: 'flex',
  });

  return (
    <div
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ ...labelBaseStyle, color: labelColor() }}>
        {labelText()}
      </span>
      <div style={cellStyle()}>
        <NumberDrag
          value={props.value}
          onChange={props.onChange}
          step={props.step}
          min={props.min}
          precision={props.precision}
          onDragEnd={props.onDragEnd}
        />
      </div>
    </div>
  );
};

const TransformDraw: Component<TransformDrawProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [pos, setPos] = createSignal({ x: 0, y: 0, z: 0 });
  const [rot, setRot] = createSignal({ x: 0, y: 0, z: 0 });
  const [scale, setScale] = createSignal({ x: 1, y: 1, z: 1 });

  createEffect(() => {
    bridge.objectVersion();
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    setPos({ x: round(node.position[0]), y: round(node.position[1]), z: round(node.position[2]) });
    setRot({
      x: round(MathUtils.radToDeg(node.rotation[0])),
      y: round(MathUtils.radToDeg(node.rotation[1])),
      z: round(MathUtils.radToDeg(node.rotation[2])),
    });
    setScale({ x: round(node.scale[0]), y: round(node.scale[1]), z: round(node.scale[2]) });
  });

  const setPosition = (axis: Axis, value: number) => {
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    const newVec: Vec3 = [...node.position];
    newVec[axisToIndex[axis]] = value;
    editor.execute(new SetTransformCommand(editor, props.uuid, 'position', newVec, node.position));
  };

  const setRotation = (axis: Axis, valueDeg: number) => {
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    const newVec: Vec3 = [...node.rotation];
    newVec[axisToIndex[axis]] = MathUtils.degToRad(valueDeg);
    editor.execute(new SetTransformCommand(editor, props.uuid, 'rotation', newVec, node.rotation));
  };

  const applyScale = (axis: Axis, value: number) => {
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    const newVec: Vec3 = [...node.scale];
    newVec[axisToIndex[axis]] = value;
    editor.execute(new SetTransformCommand(editor, props.uuid, 'scale', newVec, node.scale));
  };

  return (
    <FoldableSection sectionKey="transform" label="TRANSFORM">
      {/* Position */}
      {AXES.map((axis, i) => (
        <AxisRow
          group="position"
          axis={axis}
          isFirst={i === 0}
          value={pos()[axis]}
          onChange={(v) => setPosition(axis, v)}
          step={0.01}
          precision={3}
          onDragEnd={() => editor.history.sealLast()}
        />
      ))}
      <div style={groupSepStyle} />

      {/* Rotation */}
      {AXES.map((axis, i) => (
        <AxisRow
          group="rotation"
          axis={axis}
          isFirst={i === 0}
          value={rot()[axis]}
          onChange={(v) => setRotation(axis, v)}
          step={1}
          precision={1}
          onDragEnd={() => editor.history.sealLast()}
        />
      ))}
      <div style={groupSepStyle} />

      {/* Scale */}
      {AXES.map((axis, i) => (
        <AxisRow
          group="scale"
          axis={axis}
          isFirst={i === 0}
          value={scale()[axis]}
          onChange={(v) => applyScale(axis, v)}
          step={0.01}
          min={0.001}
          precision={3}
          onDragEnd={() => editor.history.sealLast()}
        />
      ))}

      {/* Delta Transform 子 section（hardcoded 0，階段 2 替換） */}
      <FoldableSection label="DELTA TRANSFORM" variant="subsection" sectionKey="propertiesDeltaTransform">
        {AXES.map((axis, i) => (
          <div style={rowStyle}>
            <span style={{ ...labelBaseStyle, color: i === 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {i === 0 ? `Position ${axis.toUpperCase()}` : axis.toUpperCase()}
            </span>
            <div style={{ flex: '1', overflow: 'hidden', display: 'flex' }}>
              <XYZCellReadonly axis={axis} value="0" />
            </div>
          </div>
        ))}
        <div style={groupSepStyle} />
        {AXES.map((axis, i) => (
          <div style={rowStyle}>
            <span style={{ ...labelBaseStyle, color: i === 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {i === 0 ? `Rotation ${axis.toUpperCase()}` : axis.toUpperCase()}
            </span>
            <div style={{ flex: '1', overflow: 'hidden', display: 'flex' }}>
              <XYZCellReadonly axis={axis} value="0" />
            </div>
          </div>
        ))}
        <div style={groupSepStyle} />
        {AXES.map((axis, i) => (
          <div style={rowStyle}>
            <span style={{ ...labelBaseStyle, color: i === 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {i === 0 ? `Scale ${axis.toUpperCase()}` : axis.toUpperCase()}
            </span>
            <div style={{ flex: '1', overflow: 'hidden', display: 'flex' }}>
              <XYZCellReadonly axis={axis} value="0" />
            </div>
          </div>
        ))}
      </FoldableSection>
    </FoldableSection>
  );
};

export default TransformDraw;

// ── Helpers ──────────────────────────────────
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
