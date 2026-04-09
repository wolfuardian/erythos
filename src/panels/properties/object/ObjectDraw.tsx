import { createSignal, createEffect, type Component } from 'solid-js';
import type { Object3D } from 'three';
import { useEditor } from '../../../app/EditorContext';
import { SetValueCommand } from '../../../core/commands/SetValueCommand';

interface ObjectDrawProps {
  object: Object3D;
}

const ObjectDraw: Component<ObjectDrawProps> = (props) => {
  const { editor } = useEditor();
  const [name, setName] = createSignal(props.object.name);
  const [visible, setVisible] = createSignal(props.object.visible);

  createEffect(() => {
    setName(props.object.name);
    setVisible(props.object.visible);
  });

  const handleNameChange = (value: string) => {
    editor.execute(new SetValueCommand(editor, props.object, 'name', value));
    setName(value);
  };

  const handleVisibleChange = (value: boolean) => {
    editor.execute(new SetValueCommand(editor, props.object, 'visible', value));
    setVisible(value);
  };

  return (
    <div style={{ 'margin-bottom': 'var(--space-lg)' }}>
      <div style={sectionHeader}>Object</div>

      {/* Name */}
      <div style={fieldRow}>
        <label style={fieldLabel}>Name</label>
        <input
          type="text"
          value={name()}
          onInput={(e) => handleNameChange(e.currentTarget.value)}
          style={textInput}
        />
      </div>

      {/* Type (read-only) */}
      <div style={fieldRow}>
        <label style={fieldLabel}>Type</label>
        <span style={{ color: 'var(--text-muted)', 'font-size': 'var(--font-size-sm)' }}>
          {props.object.type}
        </span>
      </div>

      {/* Visible */}
      <div style={fieldRow}>
        <label style={fieldLabel}>Visible</label>
        <input
          type="checkbox"
          checked={visible()}
          onChange={(e) => handleVisibleChange(e.currentTarget.checked)}
        />
      </div>
    </div>
  );
};

export default ObjectDraw;

// ── Shared styles ──────────────────────────────

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

const textInput = {
  flex: '1',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  'border-radius': 'var(--radius-sm)',
  color: 'var(--text-primary)',
  padding: '2px 6px',
  height: '20px',
  'font-size': 'var(--font-size-sm)',
};
