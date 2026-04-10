import { createMemo, type Component } from 'solid-js';
import { MathUtils, type Object3D } from 'three';
import { useEditor } from '../../../app/EditorContext';

interface MultiSelectDrawProps {
  objects: Object3D[];
}

const MIXED = '\u2014'; // em dash

function commonStr(objects: Object3D[], get: (o: Object3D) => string): string {
  const v = get(objects[0]);
  for (let i = 1; i < objects.length; i++) {
    if (get(objects[i]) !== v) return MIXED;
  }
  return v;
}

function commonNum(objects: Object3D[], get: (o: Object3D) => number): string {
  const v = round(get(objects[0]));
  for (let i = 1; i < objects.length; i++) {
    if (round(get(objects[i])) !== v) return MIXED;
  }
  return String(v);
}

function commonBool(objects: Object3D[], get: (o: Object3D) => boolean): boolean | null {
  const v = get(objects[0]);
  for (let i = 1; i < objects.length; i++) {
    if (get(objects[i]) !== v) return null;
  }
  return v;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

const MultiSelectDraw: Component<MultiSelectDrawProps> = (props) => {
  const bridge = useEditor();

  const info = createMemo(() => {
    bridge.objectVersion();
    const objs = props.objects;
    return {
      name: commonStr(objs, (o) => o.name),
      type: commonStr(objs, (o) => o.type),
      visible: commonBool(objs, (o) => o.visible),
      px: commonNum(objs, (o) => o.position.x),
      py: commonNum(objs, (o) => o.position.y),
      pz: commonNum(objs, (o) => o.position.z),
      rx: commonNum(objs, (o) => MathUtils.radToDeg(o.rotation.x)),
      ry: commonNum(objs, (o) => MathUtils.radToDeg(o.rotation.y)),
      rz: commonNum(objs, (o) => MathUtils.radToDeg(o.rotation.z)),
      sx: commonNum(objs, (o) => o.scale.x),
      sy: commonNum(objs, (o) => o.scale.y),
      sz: commonNum(objs, (o) => o.scale.z),
    };
  });

  return (
    <>
      <div style={summaryStyle}>
        {props.objects.length} objects selected
      </div>

      {/* Object section */}
      <div style={{ 'margin-bottom': 'var(--space-lg)' }}>
        <div style={sectionHeader}>Object</div>

        <div style={fieldRow}>
          <label style={fieldLabel}>Name</label>
          <span style={{
            color: info().name === MIXED ? 'var(--text-muted)' : 'var(--text-primary)',
            'font-size': 'var(--font-size-sm)',
          }}>
            {info().name}
          </span>
        </div>

        <div style={fieldRow}>
          <label style={fieldLabel}>Type</label>
          <span style={{
            color: info().type === MIXED ? 'var(--text-muted)' : 'var(--text-primary)',
            'font-size': 'var(--font-size-sm)',
          }}>
            {info().type}
          </span>
        </div>

        <div style={fieldRow}>
          <label style={fieldLabel}>Visible</label>
          {info().visible === null
            ? <span style={{ color: 'var(--text-muted)', 'font-size': 'var(--font-size-sm)' }}>{MIXED}</span>
            : <input type="checkbox" checked={info().visible!} disabled />
          }
        </div>
      </div>

      {/* Transform section */}
      <div style={{ 'margin-bottom': 'var(--space-lg)' }}>
        <div style={sectionHeader}>Transform</div>

        <div style={groupLabel}>Position</div>
        <div style={vectorRow}>
          <ValueField label="X" value={info().px} color="#c04040" />
          <ValueField label="Y" value={info().py} color="#3a9060" />
          <ValueField label="Z" value={info().pz} color="#4a7fbf" />
        </div>

        <div style={groupLabel}>Rotation</div>
        <div style={vectorRow}>
          <ValueField label="X" value={info().rx} color="#c04040" />
          <ValueField label="Y" value={info().ry} color="#3a9060" />
          <ValueField label="Z" value={info().rz} color="#4a7fbf" />
        </div>

        <div style={groupLabel}>Scale</div>
        <div style={vectorRow}>
          <ValueField label="X" value={info().sx} color="#c04040" />
          <ValueField label="Y" value={info().sy} color="#3a9060" />
          <ValueField label="Z" value={info().sz} color="#4a7fbf" />
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
