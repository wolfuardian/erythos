import { createSignal, createEffect, type Component } from 'solid-js';
import { useEditor } from '../../../app/EditorContext';
import { SetNodePropertyCommand } from '../../../core/commands/SetNodePropertyCommand';
import { BakeCommand } from '../../../core/commands/BakeCommand';
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
  const [isPrefab, setIsPrefab] = createSignal(false);

  createEffect(() => {
    bridge.objectVersion();
    const node = bridge.getNode(props.uuid);
    if (node) {
      setName(node.name);
      setType(inferNodeType(node));
      setIsPrefab(node.nodeType === 'prefab');
    }
  });

  const handleNameChange = (value: string) => {
    editor.execute(new SetNodePropertyCommand(editor, props.uuid, 'name', value));
    setName(value);
  };

  const handleBake = () => {
    try {
      editor.execute(new BakeCommand(editor, props.uuid));
    } catch (err) {
      console.warn('[BakeCommand] failed:', err);
    }
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

      {/* Bake button — only shown for prefab instances */}
      {isPrefab() && (
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}></label>
          <button
            onClick={handleBake}
            class={styles.bakeButton}
            title="Flatten prefab instance into independent scene nodes"
          >
            Bake Instance
          </button>
        </div>
      )}
    </FoldableSection>
    </div>
  );
};

export default ObjectDraw;
