import { createSignal, createEffect, type Component } from 'solid-js';
import { MathUtils } from 'three';
import { useEditor } from '../../../app/EditorContext';
import { SetTransformCommand } from '../../../core/commands/SetTransformCommand';
import type { Vec3 } from '../../../core/scene/SceneFormat';

interface TransformDrawProps {
  uuid: string;
}

const axisToIndex = { x: 0, y: 1, z: 2 } as const;

const TransformDraw: Component<TransformDrawProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;

  // Local state for display (updates on objectVersion changes)
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
    <div style={{ 'margin-bottom': 'var(--space-lg)' }}>
      <div style={sectionHeader}>Transform</div>

      {/* Position */}
      <div style={groupLabel}>Position</div>
      <div style={vectorRow}>
        <NumField label="X" value={px()} color="#c04040" onChange={(v) => setPosition('x', v)} />
        <NumField label="Y" value={py()} color="#3a9060" onChange={(v) => setPosition('y', v)} />
        <NumField label="Z" value={pz()} color="#4a7fbf" onChange={(v) => setPosition('z', v)} />
      </div>

      {/* Rotation */}
      <div style={groupLabel}>Rotation</div>
      <div style={vectorRow}>
        <NumField label="X" value={rx()} color="#c04040" onChange={(v) => setRotation('x', v)} />
        <NumField label="Y" value={ry()} color="#3a9060" onChange={(v) => setRotation('y', v)} />
        <NumField label="Z" value={rz()} color="#4a7fbf" onChange={(v) => setRotation('z', v)} />
      </div>

      {/* Scale */}
      <div style={groupLabel}>Scale</div>
      <div style={vectorRow}>
        <NumField label="X" value={sx()} color="#c04040" onChange={(v) => setScale('x', v)} />
        <NumField label="Y" value={sy()} color="#3a9060" onChange={(v) => setScale('y', v)} />
        <NumField label="Z" value={sz()} color="#4a7fbf" onChange={(v) => setScale('z', v)} />
      </div>
    </div>
  );
};

export default TransformDraw;

// ── NumField component ────────────────────────

interface NumFieldProps {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
}

const NumField: Component<NumFieldProps> = (props) => {
  const handleInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const v = parseFloat(e.currentTarget.value);
    if (!isNaN(v)) props.onChange(v);
  };

  return (
    <div style={{ display: 'flex', 'align-items': 'center', flex: 1, gap: '2px' }}>
      <span style={{
        color: props.color,
        'font-size': 'var(--font-size-xs)',
        'font-weight': 'bold',
        width: '12px',
        'text-align': 'center',
      }}>
        {props.label}
      </span>
      <input
        type="number"
        value={props.value}
        onInput={handleInput}
        step="0.1"
        style={{
          flex: 1,
          width: '0',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          'border-radius': 'var(--radius-sm)',
          color: 'var(--text-primary)',
          padding: '2px 4px',
          height: '20px',
          'font-size': 'var(--font-size-sm)',
          'font-family': 'var(--font-mono)',
        }}
      />
    </div>
  );
};

// ── Helpers & styles ─────────────────────────

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

const sectionHeader = {
  'font-size': 'var(--font-size-sm)',
  'font-weight': '600' as const,
  color: 'var(--text-primary)',
  'margin-bottom': 'var(--space-md)',
  'padding-bottom': 'var(--space-xs)',
  'border-bottom': '1px solid var(--border-subtle)',
  'text-transform': 'uppercase' as const,
  'letter-spacing': '0.5px',
};

const groupLabel = {
  color: 'var(--text-secondary)',
  'font-size': 'var(--font-size-sm)',
  'margin-bottom': 'var(--space-xs)',
  'margin-top': 'var(--space-sm)',
};

const vectorRow = {
  display: 'flex',
  gap: 'var(--space-sm)',
  'margin-bottom': 'var(--space-sm)',
};
