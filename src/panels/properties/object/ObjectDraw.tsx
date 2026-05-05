import { createSignal, createEffect, type Component } from 'solid-js';
import { useEditor } from '../../../app/EditorContext';
import { SetNodePropertyCommand } from '../../../core/commands/SetNodePropertyCommand';
import { inferNodeType } from '../../../core/scene/inferNodeType';
import FoldableSection from '../components/FoldableSection';
import styles from './object.module.css';
import type { NodeUUID } from '../../../utils/branded';

interface ObjectDrawProps {
  uuid: NodeUUID;
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
    <div data-testid="object-draw">
    <FoldableSection sectionKey="object" label="OBJECT">
      {/* Name（可編輯） */}
      <div class={styles.fieldRow}>
        <label class={styles.fieldLabel}>Name</label>
        <input
          type="text"
          value={name()}
          onInput={(e) => handleNameChange(e.currentTarget.value)}
          class={styles.textInput}
        />
      </div>

      {/* Type（唯讀，顯示為 span 仿 input 樣式） */}
      <div class={styles.fieldRow}>
        <label class={styles.fieldLabel}>Type</label>
        <span class={styles.typeDisplay}>
          {type()}
        </span>
      </div>
    </FoldableSection>
    </div>
  );
};

export default ObjectDraw;
