import { createSignal, createEffect, type Component } from 'solid-js';
import { useEditor } from '../../../app/EditorContext';
import { SetNodePropertyCommand } from '../../../core/commands/SetNodePropertyCommand';
import { inferNodeType } from '../../../core/scene/inferNodeType';

interface ObjectDrawProps {
  uuid: string;
}

const ObjectDraw: Component<ObjectDrawProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [name, setName] = createSignal('');
  const [type, setType] = createSignal('');

  createEffect(() => {
    bridge.objectVersion();
    const node = bridge.getNode(props.uuid);
    if (node) {
      setName(node.name);
      setType(inferNodeType(node));
    }
  });

  const handleNameChange = (value: string) => {
    editor.execute(new SetNodePropertyCommand(editor, props.uuid, 'name', value));
    setName(value);
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

      {/* Type */}
      <div style={fieldRow}>
        <label style={fieldLabel}>Type</label>
        <span style={{
          flex: '1',
          color: 'var(--text-secondary)',
          'font-size': 'var(--font-size-sm)',
        }}>
          {type()}
        </span>
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
