import { type Component, createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { AddNodeCommand } from '../../core/commands/AddNodeCommand';
import styles from './HeaderToolBar.module.css';

const ITEMS: { label: string; type: string }[] = [
  { label: '+ Cube', type: 'cube' },
  { label: '+ Sphere', type: 'sphere' },
  { label: '+ Plane', type: 'plane' },
  { label: '+ Cylinder', type: 'cylinder' },
  { label: '+ Directional Light', type: 'directional-light' },
  { label: '+ Ambient Light', type: 'ambient-light' },
  { label: '+ Camera', type: 'camera' },
  { label: '+ Group', type: 'group' },
];

export const HeaderToolBar: Component<{
  onSearchChange: (q: string) => void;
}> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [open, setOpen] = createSignal(false);

  const addObject = (type: string) => {
    switch (type) {
      case 'cube': {
        const node = editor.sceneDocument.createNode('Cube');
        node.nodeType = 'mesh';
        node.asset = 'primitives://box';
        node.mat = { color: 0x808080 };
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'sphere': {
        const node = editor.sceneDocument.createNode('Sphere');
        node.nodeType = 'mesh';
        node.asset = 'primitives://sphere';
        node.mat = { color: 0x808080 };
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'plane': {
        const node = editor.sceneDocument.createNode('Plane');
        node.nodeType = 'mesh';
        node.asset = 'primitives://plane';
        node.mat = { color: 0x808080 };
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'cylinder': {
        const node = editor.sceneDocument.createNode('Cylinder');
        node.nodeType = 'mesh';
        node.asset = 'primitives://cylinder';
        node.mat = { color: 0x808080 };
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'directional-light': {
        const node = editor.sceneDocument.createNode('Directional Light');
        node.nodeType = 'light';
        node.light = { type: 'directional', color: 0xffffff, intensity: 1 };
        node.position = [2, 4, 3];
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'ambient-light': {
        const node = editor.sceneDocument.createNode('Ambient Light');
        node.nodeType = 'light';
        node.light = { type: 'ambient', color: 0xffffff, intensity: 0.4 };
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'camera': {
        const node = editor.sceneDocument.createNode('Camera');
        node.nodeType = 'camera';
        node.camera = { type: 'perspective', fov: 50, near: 0.1, far: 100 };
        node.position = [0, 2, 5];
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'group': {
        const node = editor.sceneDocument.createNode('Group');
        node.nodeType = 'group';
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
    }
    setOpen(false);
  };

  createEffect(() => {
    if (!open()) return;
    const handler = () => setOpen(false);
    document.addEventListener('click', handler, true);
    onCleanup(() => document.removeEventListener('click', handler, true));
  });

  return (
    <div data-testid="scene-tree-header-toolbar" class={styles.toolbar}>
      <div class={styles.dropdownWrapper}>
        <button
          data-testid="scene-tree-new-object-btn"
          class={styles.newObjectBtn}
          disabled={bridge.editorReadOnly()}
          onClick={(e) => { e.stopPropagation(); if (!bridge.editorReadOnly()) setOpen((v) => !v); }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <Show when={open()}>
          <div data-testid="scene-tree-new-object-dropdown" class={styles.dropdown}>
            <For each={ITEMS}>
              {(item) => (
                <button
                  class={styles.dropdownItem}
                  onClick={(e) => { e.stopPropagation(); addObject(item.type); }}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <input
        data-testid="scene-tree-search"
        type="text"
        placeholder="Search..."
        class={styles.searchInput}
        onInput={(e) => props.onSearchChange(e.currentTarget.value)}
      />
    </div>
  );
};
