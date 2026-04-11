import { createMemo, type Component } from 'solid-js';
import { MathUtils } from 'three';
import { useEditor } from '../../../app/EditorContext';
import type { SceneNode } from '../../../core/scene/SceneFormat';

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
      <div style={summaryStyle}>
        {props.uuids.length} objects selected
      </div>

      {/* Object section */}
      <div style={{ 'margin-bottom': 'var(--space-lg)' }}>
        <div style={sectionHeader}>Object</div>

        <div style={fieldRow}>
          <label style={fieldLabel}>Name</label>
          <span style={{
            color: info()?.name === MIXED ? 'var(--text-muted)' : 'var(--text-primary)',
            'font-size': 'var(--font-size-sm)',
          }}>
            {info()?.name ?? MIXED}
          </span>
        </div>
      </div>

      {/* Transform section */}
      <div style={{ 'margin-bottom': 'var(--space-lg)' }}>
        <div style={sectionHeader}>Transform</div>

        <div style={groupLabel}>Position</div>
        <div style={vectorRow}>
          <ValueField label="X" value={info()?.px ?? MIXED} color="#c04040" />
          <ValueField label="Y" value={info()?.py ?? MIXED} color="#3a9060" />
          <ValueField label="Z" value={info()?.pz ?? MIXED} color="#4a7fbf" />
        </div>

        <div style={groupLabel}>Rotation</div>
        <div style={vectorRow}>
          <ValueField label="X" value={info()?.rx ?? MIXED} color="#c04040" />
          <ValueField label="Y" value={info()?.ry ?? MIXED} color="#3a9060" />
          <ValueField label="Z" value={info()?.rz ?? MIXED} color="#4a7fbf" />
        </div>

        <div style={groupLabel}>Scale</div>
        <div style={vectorRow}>
          <ValueField label="X" value={info()?.sx ?? MIXED} color="#c04040" />
          <ValueField label="Y" value={info()?.sy ?? MIXED} color="#3a9060" />
          <ValueField label="Z" value={info()?.sz ?? MIXED} color="#4a7fbf" />
        </div>
      </div>
    </>
  );
};

export default MultiSelectDraw;

// ── ValueField (read-only NumField equivalent) ──

const ValueField: Component<{ label: string; value: string; color: string }> = (props) => (
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
    <span style={{
      flex: 1,
      width: '0',
      background: 'var(--bg-input)',
      border: '1px solid var(--border-subtle)',
      'border-radius': 'var(--radius-sm)',
      color: props.value === MIXED ? 'var(--text-muted)' : 'var(--text-primary)',
      padding: '2px 4px',
      height: '20px',
      'line-height': '16px',
      'font-size': 'var(--font-size-sm)',
      'font-family': 'var(--font-mono)',
      'text-align': props.value === MIXED ? 'center' : 'left',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap',
    }}>
      {props.value}
    </span>
  </div>
);

// ── Styles (matching ObjectDraw / TransformDraw) ──

const summaryStyle = {
  color: 'var(--text-secondary)',
  'font-size': 'var(--font-size-sm)',
  'text-align': 'center' as const,
  'margin-bottom': 'var(--space-lg)',
};

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

const fieldRow = {
  display: 'flex',
  'align-items': 'center',
  'margin-bottom': 'var(--space-sm)',
  'min-height': 'var(--row-height)',
};

const fieldLabel = {
  width: '70px',
  'flex-shrink': '0',
  color: 'var(--text-secondary)',
  'font-size': 'var(--font-size-sm)',
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
