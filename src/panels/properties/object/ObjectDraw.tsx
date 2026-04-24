import { createSignal, createEffect, type Component } from 'solid-js';
import { useEditor } from '../../../app/EditorContext';
import { SetNodePropertyCommand } from '../../../core/commands/SetNodePropertyCommand';
import { inferNodeType } from '../../../core/scene/inferNodeType';
import FoldableSection from '../components/FoldableSection';
import { fieldRow, fieldLabel, textInputBase, textInputRest, textInputFocus } from '../components/fieldStyles';

interface ObjectDrawProps {
  uuid: string;
}

const ObjectDraw: Component<ObjectDrawProps> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [name, setName] = createSignal('');
  const [type, setType] = createSignal('');
  const [nameFocused, setNameFocused] = createSignal(false);
  const [nameRowHovered, setNameRowHovered] = createSignal(false);

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
    <div data-devid="object-draw">
    <FoldableSection sectionKey="object" label="OBJECT">
      {/* Name（可編輯） */}
      <div
        style={{
          ...fieldRow,
          background: nameRowHovered() ? 'var(--bg-hover)' : 'transparent',
        }}
        onMouseEnter={() => setNameRowHovered(true)}
        onMouseLeave={() => setNameRowHovered(false)}
      >
        <label style={fieldLabel}>Name</label>
        <input
          type="text"
          value={name()}
          onInput={(e) => handleNameChange(e.currentTarget.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          style={{
            ...textInputBase,
            ...(nameFocused() ? textInputFocus : textInputRest),
          }}
        />
      </div>

      {/* Type（唯讀，顯示為 span 仿 input 樣式） */}
      <div style={fieldRow}>
        <label style={fieldLabel}>Type</label>
        <span style={{
          flex: '1',
          height: '22px',
          'border-radius': '3px',
          padding: '0 8px',
          display: 'flex',
          'align-items': 'center',
          'font-size': 'var(--font-size-sm)',
          'font-weight': '500',
          color: 'var(--text-secondary)',
          cursor: 'default',
          background: 'transparent',
        }}>
          {type()}
        </span>
      </div>
    </FoldableSection>
    </div>
  );
};

export default ObjectDraw;
