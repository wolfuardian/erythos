import { createSignal, createEffect, type Component } from 'solid-js';
import { MathUtils } from 'three';
import { useEditor } from '../../../app/EditorContext';
import { SetTransformCommand } from '../../../core/commands/SetTransformCommand';
import type { Vec3 } from '../../../core/scene/SceneFormat';
import FoldableSection from '../components/FoldableSection';
import { XYZCellReadonly } from '../components/XYZCell';
import { VectorDrag } from '../../../components/VectorDrag';
import { fieldLabel, xyzRow, groupLabelRow } from '../components/fieldStyles';

interface TransformDrawProps {
  uuid: string;
}

const axisToIndex = { x: 0, y: 1, z: 2 } as const;

const TransformDraw: Component<TransformDrawProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [pos, setPos] = createSignal<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [rot, setRot] = createSignal<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [scale, setScale] = createSignal<{ x: number; y: number; z: number }>({ x: 1, y: 1, z: 1 });

  createEffect(() => {
    bridge.objectVersion();
    const node = bridge.getNode(props.uuid);
    if (!node) return;
    setPos({ x: round(node.position[0]), y: round(node.position[1]), z: round(node.position[2]) });
    setRot({ x: round(MathUtils.radToDeg(node.rotation[0])), y: round(MathUtils.radToDeg(node.rotation[1])), z: round(MathUtils.radToDeg(node.rotation[2])) });
    setScale({ x: round(node.scale[0]), y: round(node.scale[1]), z: round(node.scale[2]) });
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

  const applyScale = (axis: 'x' | 'y' | 'z', value: number) => {
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
        <VectorDrag
          values={[pos().x, pos().y, pos().z]}
          onChange={(i, v) => setPosition((['x', 'y', 'z'] as const)[i], v)}
          step={0.01}
          precision={3}
          onDragEnd={() => editor.history.sealLast()}
        />
      </div>

      {/* Rotation */}
      <div style={groupLabelRow}>
        <span style={fieldLabel}>Rotation</span>
        <VectorDrag
          values={[rot().x, rot().y, rot().z]}
          onChange={(i, v) => setRotation((['x', 'y', 'z'] as const)[i], v)}
          step={1}
          precision={1}
          onDragEnd={() => editor.history.sealLast()}
        />
      </div>

      {/* Scale */}
      <div style={groupLabelRow}>
        <span style={fieldLabel}>Scale</span>
        <VectorDrag
          values={[scale().x, scale().y, scale().z]}
          onChange={(i, v) => applyScale((['x', 'y', 'z'] as const)[i], v)}
          step={0.01}
          min={0.001}
          precision={3}
          onDragEnd={() => editor.history.sealLast()}
        />
      </div>

      {/* Delta Transform 子 section（hardcoded 0，驗證 deep tint 視覺，階段 2 替換） */}
      <FoldableSection label="DELTA TRANSFORM" variant="subsection" sectionKey="propertiesDeltaTransform">
        {/* Position */}
        <div style={groupLabelRow}>
          <span style={fieldLabel}>Position</span>
          <div style={xyzRow}>
            <XYZCellReadonly axis="x" value="0" />
            <XYZCellReadonly axis="y" value="0" />
            <XYZCellReadonly axis="z" value="0" />
          </div>
        </div>

        {/* Rotation */}
        <div style={groupLabelRow}>
          <span style={fieldLabel}>Rotation</span>
          <div style={xyzRow}>
            <XYZCellReadonly axis="x" value="0" />
            <XYZCellReadonly axis="y" value="0" />
            <XYZCellReadonly axis="z" value="0" />
          </div>
        </div>

        {/* Scale */}
        <div style={groupLabelRow}>
          <span style={fieldLabel}>Scale</span>
          <div style={xyzRow}>
            <XYZCellReadonly axis="x" value="0" />
            <XYZCellReadonly axis="y" value="0" />
            <XYZCellReadonly axis="z" value="0" />
          </div>
        </div>
      </FoldableSection>
    </FoldableSection>
  );
};

export default TransformDraw;

// ── Helpers ──────────────────────────────────
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
