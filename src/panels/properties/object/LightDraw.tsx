import { createSignal, createEffect, createMemo, Show, type Component } from 'solid-js';
import { useEditor } from '../../../app/EditorContext';
import { SetLightPropertyCommand } from '../../../core/commands';
import { inferNodeType } from '../../../core/scene/inferNodeType';
import type { LightComponent } from '../../../core/scene/SceneFormat';
import { NumberDrag } from '../../../components/NumberDrag';
import FoldableSection from '../components/FoldableSection';
import styles from './object.module.css';
import type { NodeUUID } from '../../../utils/branded';
import { asNodeUUID } from '../../../utils/branded';

interface Props {
  uuid: string;
}

const LightDraw: Component<Props> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;

  const nodeUUID = (): NodeUUID => asNodeUUID(props.uuid);

  const isDirectionalLight = createMemo(() => {
    bridge.objectVersion();
    const node = bridge.getNode(nodeUUID());
    return node != null && inferNodeType(node) === 'DirectionalLight';
  });

  const [intensity, setIntensity] = createSignal(1);

  createEffect(() => {
    bridge.objectVersion();
    const node = bridge.getNode(nodeUUID());
    if (!node || inferNodeType(node) !== 'DirectionalLight') return;
    const light = node.components?.light as LightComponent | null;
    if (light) {
      setIntensity(light.intensity);
    }
  });

  const getOldIntensity = (): number => {
    const node = bridge.getNode(nodeUUID());
    const light = node?.components?.light as LightComponent | null;
    return light?.intensity ?? 1;
  };

  return (
    <Show when={isDirectionalLight()}>
      <FoldableSection sectionKey="light" label="LIGHT">
        <div class={styles.fieldRow}>
          <label class={styles.fieldLabel}>Intensity</label>
          <NumberDrag
            value={intensity()}
            min={0}
            max={10}
            step={0.05}
            precision={2}
            onChange={(v) => {
              editor.execute(new SetLightPropertyCommand(editor, props.uuid, 'intensity', v, getOldIntensity()));
            }}
            onDragEnd={() => editor.history.sealLast()}
          />
        </div>
      </FoldableSection>
    </Show>
  );
};

export default LightDraw;
