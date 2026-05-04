import { createMemo, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { useAreaState } from '../../app/areaState';
import type { SceneNode } from '../../core/scene/SceneFormat';
import { PanelHeader } from '../../components/PanelHeader';
import styles from './ContextPanel.module.css';

function compactJson(json: string): string {
  return json.replace(
    /\[\n\s+(-?[\d.]+(?:e[+-]?\d+)?),\n\s+(-?[\d.]+(?:e[+-]?\d+)?),\n\s+(-?[\d.]+(?:e[+-]?\d+)?)\n\s+\]/g,
    '[$1, $2, $3]',
  );
}

function isVec3(value: unknown, def: [number, number, number]): boolean {
  return Array.isArray(value) && value.length === 3
    && value[0] === def[0] && value[1] === def[1] && value[2] === def[2];
}

function isEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}

function stripDefaults(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'id' || key === 'name') { result[key] = value; continue; }
    if (key === 'parent' && value === null) continue;
    if (key === 'order' && value === 0) continue;
    if (key === 'position' && isVec3(value, [0, 0, 0])) continue;
    if (key === 'rotation' && isVec3(value, [0, 0, 0])) continue;
    if (key === 'scale' && isVec3(value, [1, 1, 1])) continue;
    if ((key === 'components' || key === 'userData') && isEmptyObject(value)) continue;
    result[key] = value;
  }
  return result;
}

function buildTree(root: SceneNode, allNodes: SceneNode[], strip: boolean): object {
  const base = strip ? stripDefaults(root as unknown as Record<string, unknown>) : { ...root };
  const children = allNodes
    .filter(n => n.parent === root.id)
    .sort((a, b) => a.order - b.order)
    .map(child => buildTree(child, allNodes, strip));
  if (children.length > 0) {
    return { ...base, children };
  }
  return base;
}

const ContextPanel: Component = () => {
  const bridge = useEditor();
  const [showTree, setShowTree] = useAreaState<boolean>('showTree', false);
  const [compact, setCompact] = useAreaState<boolean>('compact', false);
  const [hideDefaults, setHideDefaults] = useAreaState<boolean>('hideDefaults', false);

  const sceneJson = createMemo(() => {
    const uuids = bridge.selectedUUIDs();
    bridge.sceneVersion(); // reactive dep — re-runs on full scene replacement (load/import)
    bridge.nodes();        // reactive dep — re-runs on any node add/remove/change

    let raw: string;
    if (uuids.length > 0) {
      const node = bridge.getNode(uuids[0]);
      if (showTree() && node) {
        raw = JSON.stringify(buildTree(node, bridge.nodes(), hideDefaults()), null, 2);
      } else if (node) {
        const data = hideDefaults() ? stripDefaults(node as unknown as Record<string, unknown>) : node;
        raw = JSON.stringify(data, null, 2);
      } else {
        raw = JSON.stringify(null, null, 2);
      }
    } else {
      raw = JSON.stringify(bridge.editor.sceneDocument.serialize(), null, 2);
    }
    return compact() ? compactJson(raw) : raw;
  });

  return (
    <div data-testid="context-panel" class={styles.panel}>
      <PanelHeader title="Context" />
      <div class={styles.body}>
      <div class={styles.controls}>
        <input
          type="checkbox"
          checked={showTree()}
          onChange={(e) => setShowTree(e.currentTarget.checked)}
          id="show-tree-toggle"
        />
        <label for="show-tree-toggle" class={styles.label}>
          Show Tree
        </label>

        <input
          type="checkbox"
          checked={compact()}
          onChange={(e) => setCompact(e.currentTarget.checked)}
          id="compact-toggle"
          class={styles.checkboxGap}
        />
        <label for="compact-toggle" class={styles.label}>
          Compact
        </label>

        <input
          type="checkbox"
          checked={hideDefaults()}
          onChange={(e) => setHideDefaults(e.currentTarget.checked)}
          id="hide-defaults-toggle"
          class={styles.checkboxGap}
        />
        <label for="hide-defaults-toggle" class={styles.label}>
          Hide Defaults
        </label>
      </div>

      <pre class={styles.pre}>
        {sceneJson()}
      </pre>
      </div>
    </div>
  );
};

export default ContextPanel;
