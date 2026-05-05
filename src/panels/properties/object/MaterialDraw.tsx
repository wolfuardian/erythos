import { Component, createEffect, createMemo, createSignal, Show } from 'solid-js';
import { useEditor } from '../../../app/EditorContext';
import { SetMaterialPropertyCommand } from '../../../core/commands/SetMaterialPropertyCommand';
import type { MaterialComponent } from '../../../core/scene/SceneFormat';
import type { NodeUUID } from '../../../utils/branded';
import { asNodeUUID } from '../../../utils/branded';
import FoldableSection from '../components/FoldableSection';
import { ColorInput } from '../components/ColorInput';
import { NumberDrag } from '../../../components/NumberDrag';
import styles from './object.module.css';

interface Props { uuid: string; }

const DEFAULTS = {
  roughness: 1, metalness: 0, emissive: 0x000000,
  opacity: 1, transparent: false, wireframe: false,
} as const;

const MaterialDraw: Component<Props> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;

  const nodeUUID = (): NodeUUID => asNodeUUID(props.uuid);

  const hasMaterial = createMemo(() => {
    bridge.objectVersion();
    return (bridge.getNode(nodeUUID())?.components?.material as MaterialComponent | null) != null;
  });

  const [mat, setMat] = createSignal({
    color: 0xffffff, roughness: 1, metalness: 0,
    emissive: 0x000000, opacity: 1, transparent: false, wireframe: false,
  });

  createEffect(() => {
    bridge.objectVersion();
    const node = bridge.getNode(nodeUUID());
    const m = node?.components?.material as MaterialComponent | null;
    if (!m) return;
    setMat({
      color:       m.color,
      roughness:   m.roughness   ?? DEFAULTS.roughness,
      metalness:   m.metalness   ?? DEFAULTS.metalness,
      emissive:    m.emissive    ?? DEFAULTS.emissive,
      opacity:     m.opacity     ?? DEFAULTS.opacity,
      transparent: m.transparent ?? DEFAULTS.transparent,
      wireframe:   m.wireframe   ?? DEFAULTS.wireframe,
    });
  });

  const getOld = (prop: keyof MaterialComponent): MaterialComponent[keyof MaterialComponent] => {
    const m = bridge.getNode(nodeUUID())?.components?.material as MaterialComponent | null;
    return m ? (m[prop] ?? (DEFAULTS as Record<string, number | boolean | undefined>)[prop]) : undefined;
  };

  const exec = (prop: keyof MaterialComponent, val: MaterialComponent[keyof MaterialComponent]) => {
    editor.execute(new SetMaterialPropertyCommand(editor, props.uuid, prop, val, getOld(prop)));
  };

  return (
    <Show when={hasMaterial()}>
      <FoldableSection sectionKey="material" label="MATERIAL">
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Color</label>
          <ColorInput value={mat().color} onInput={(v) => exec('color', v)} onChange={() => editor.history.sealLast()} />
        </div>
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Roughness</label>
          <NumberDrag value={mat().roughness} min={0} max={1} step={0.01} precision={2} onChange={(v) => exec('roughness', v)} onDragEnd={() => editor.history.sealLast()} />
        </div>
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Metalness</label>
          <NumberDrag value={mat().metalness} min={0} max={1} step={0.01} precision={2} onChange={(v) => exec('metalness', v)} onDragEnd={() => editor.history.sealLast()} />
        </div>
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Emissive</label>
          <ColorInput value={mat().emissive} onInput={(v) => exec('emissive', v)} onChange={() => editor.history.sealLast()} />
        </div>
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Opacity</label>
          <NumberDrag value={mat().opacity} min={0} max={1} step={0.01} precision={2} onChange={(v) => exec('opacity', v)} onDragEnd={() => editor.history.sealLast()} />
        </div>
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Transparent</label>
          <input type="checkbox" checked={mat().transparent} onChange={(e) => { exec('transparent', e.currentTarget.checked); editor.history.sealLast(); }} />
        </div>
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Wireframe</label>
          <input type="checkbox" checked={mat().wireframe} onChange={(e) => { exec('wireframe', e.currentTarget.checked); editor.history.sealLast(); }} />
        </div>
      </FoldableSection>
    </Show>
  );
};

export default MaterialDraw;
