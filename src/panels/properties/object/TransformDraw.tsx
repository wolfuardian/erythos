import { createSignal, createEffect, type Component } from 'solid-js';
import { MathUtils } from 'three';
import { useEditor } from '../../../app/EditorContext';
import { SetTransformCommand } from '../../../core/commands/SetTransformCommand';
import type { Vec3 } from '../../../core/scene/SceneFormat';
import FoldableSection from '../components/FoldableSection';
import { XYZCellEditable } from '../components/XYZCell';
import { fieldLabel, xyzRow, groupLabelRow } from '../components/fieldStyles';

interface TransformDrawProps {
  uuid: string;
}

const axisToIndex = { x: 0, y: 1, z: 2 } as const;

const TransformDraw: Component<TransformDrawProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [px, setPx] = createSignal(0);
  const [py, setPy] = createSignal(0);
  const [pz, setPz] = createSignal(0);
  const [rx, setRx] = createSignal(0);
  const [ry, setRy] = createSignal(0);
  const [rz, setRz] = createSignal(0);
  const [sx, setSx] = createSignal(1);
  const [sy, setSy] = createSignal(1);
  const [sz, setSz] = createSignal(1);

  createEffect(() => {
    bridge.objectVersion();
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    setPx(round(node.position[0]));
    setPy(round(node.position[1]));
    setPz(round(node.position[2]));
    setRx(round(MathUtils.radToDeg(node.rotation[0])));
    setRy(round(MathUtils.radToDeg(node.rotation[1])));
    setRz(round(MathUtils.radToDeg(node.rotation[2])));
    setSx(round(node.scale[0]));
    setSy(round(node.scale[1]));
    setSz(round(node.scale[2]));
  });

  const setPosition = (axis: 'x' | 'y' | 'z', value: number) => {
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    const newVec: Vec3 = [...node.position];
    newVec[axisToIndex[axis]] = value;
    editor.execute(new SetTransformCommand(editor, props.uuid, 'position', newVec, node.position));
  };

  const setRotation = (axis: 'x' | 'y' | 'z', valueDeg: number) => {
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    const newVec: Vec3 = [...node.rotation];
    newVec[axisToIndex[axis]] = MathUtils.degToRad(valueDeg);
    editor.execute(new SetTransformCommand(editor, props.uuid, 'rotation', newVec, node.rotation));
  };

  const setScale = (axis: 'x' | 'y' | 'z', value: number) => {
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    const newVec: Vec3 = [...node.scale];
    newVec[axisToIndex[axis]] = value;
    editor.execute(new SetTransformCommand(editor, props.uuid, 'scale', newVec, node.scale));
  };

  return (
    <FoldableSection sectionKey="transform" label="TRANSFORM">
      {/* Position */}
      <div style={groupLabelRow}>
        <span style={fieldLabel}>Position</span>
        <div style={xyzRow}>
          <XYZCellEditable axis="x" value={px()} onChange={(v) => setPosition('x', v)} />
          <XYZCellEditable axis="y" value={py()} onChange={(v) => setPosition('y', v)} />
          <XYZCellEditable axis="z" value={pz()} onChange={(v) => setPosition('z', v)} />
        </div>
      </div>

      {/* Rotation */}
      <div style={groupLabelRow}>
        <span style={fieldLabel}>Rotation</span>
        <div style={xyzRow}>
          <XYZCellEditable axis="x" value={rx()} onChange={(v) => setRotation('x', v)} />
          <XYZCellEditable axis="y" value={ry()} onChange={(v) => setRotation('y', v)} />
          <XYZCellEditable axis="z" value={rz()} onChange={(v) => setRotation('z', v)} />
        </div>
      </div>

      {/* Scale */}
      <div style={groupLabelRow}>
        <span style={fieldLabel}>Scale</span>
        <div style={xyzRow}>
          <XYZCellEditable axis="x" value={sx()} onChange={(v) => setScale('x', v)} />
          <XYZCellEditable axis="y" value={sy()} onChange={(v) => setScale('y', v)} />
          <XYZCellEditable axis="z" value={sz()} onChange={(v) => setScale('z', v)} />
        </div>
      </div>
    </FoldableSection>
  );
};

export default TransformDraw;

// ── Helpers ──────────────────────────────────
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
