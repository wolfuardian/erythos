import { type Component, createSignal } from 'solid-js';
import { ErrorDialog } from './ErrorDialog';
import { loadGLTFFromFile } from '../utils/gltfLoader';
import { useEditor } from '../app/EditorContext';
import { AddNodeCommand } from '../core/commands/AddNodeCommand';
import type { TransformMode } from '../core/EventEmitter';
import styles from './SceneOpsToolbar.module.css';

export const SceneOpsToolbar: Component<{
  orientation: 'horizontal' | 'vertical';
}> = (props) => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [importing, setImporting] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal('');
  const [errorTitle, setErrorTitle] = createSignal('');

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        await loadGLTFFromFile(file, editor);
      } catch (e: any) {
        setErrorTitle('Import Failed');
        setErrorMsg(e.message || String(e));
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleSave = async () => {
    try {
      await bridge.autosaveFlush();
    } catch (e: any) {
      setErrorTitle('Save Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.scene,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const data = await file.text();
        const parsed = JSON.parse(data);
        await editor.loadScene(parsed);
      } catch (e: any) {
        setErrorTitle('Load Failed');
        setErrorMsg(e.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const addMesh = (name: string, type: 'box' | 'sphere' | 'plane' | 'cylinder') => {
    const node = editor.sceneDocument.createNode(name);
    node.components = { geometry: { type }, material: { color: 0x808080 } };
    editor.execute(new AddNodeCommand(editor, node));
  };

  const addObject = (type: string) => {
    switch (type) {
      case 'cube':
        addMesh('Cube', 'box');
        break;
      case 'sphere':
        addMesh('Sphere', 'sphere');
        break;
      case 'plane':
        addMesh('Plane', 'plane');
        break;
      case 'cylinder':
        addMesh('Cylinder', 'cylinder');
        break;
      case 'directional-light': {
        const node = editor.sceneDocument.createNode('Directional Light');
        node.components = { light: { type: 'directional', color: 0xffffff, intensity: 1 } };
        node.position = [2, 4, 3];
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'ambient-light': {
        const node = editor.sceneDocument.createNode('Ambient Light');
        node.components = { light: { type: 'ambient', color: 0xffffff, intensity: 0.4 } };
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'camera': {
        const node = editor.sceneDocument.createNode('Camera');
        node.components = { camera: { type: 'perspective', fov: 50, near: 0.1, far: 100 } };
        node.position = [0, 2, 5];
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
      case 'group': {
        const node = editor.sceneDocument.createNode('Group');
        editor.execute(new AddNodeCommand(editor, node));
        break;
      }
    }
  };

  const isHorizontal = () => props.orientation === 'horizontal';

  const Divider = () => (
    <div class={isHorizontal() ? styles.dividerH : styles.dividerV} />
  );

  return (
    <div
      data-testid="scene-ops-toolbar"
      class={styles.toolbar}
      classList={{
        [styles.toolbarHorizontal]: isHorizontal(),
        [styles.toolbarVertical]: !isHorizontal(),
      }}
    >
      {/* History group: Undo / Redo */}
      <ToolbarBtn label="Undo" onClick={() => editor.undo()} disabled={!bridge.canUndo()} title="Undo (Ctrl+Z)" />
      <ToolbarBtn label="Redo" onClick={() => editor.redo()} disabled={!bridge.canRedo()} title="Redo (Ctrl+Y)" />

      <Divider />

      {/* Add group */}
      <ToolbarBtn label="+ Cube" onClick={() => addObject('cube')} />
      <ToolbarBtn label="+ Sphere" onClick={() => addObject('sphere')} />
      <ToolbarBtn label="+ Plane" onClick={() => addObject('plane')} />
      <ToolbarBtn label="+ Cylinder" onClick={() => addObject('cylinder')} />
      <ToolbarBtn label="+ Light" onClick={() => addObject('directional-light')} />
      <ToolbarBtn label="+ Ambient" onClick={() => addObject('ambient-light')} />
      <ToolbarBtn label="+ Camera" onClick={() => addObject('camera')} />
      <ToolbarBtn label="+ Group" onClick={() => addObject('group')} />

      <Divider />

      {/* File group */}
      <ToolbarBtn label="Import" onClick={handleImport} disabled={importing()} title="Import GLTF/GLB" />
      <ToolbarBtn label="Save" onClick={handleSave} title="Save Scene" />
      <ToolbarBtn label="Load" onClick={handleLoad} disabled={loading()} title="Load Scene" />

      <Divider />

      {/* Transform group */}
      <TransformBtn mode="translate" label="Move" hotkey="W" currentMode={bridge.transformMode} onSelect={(m) => editor.setTransformMode(m)} />
      <TransformBtn mode="rotate" label="Rotate" hotkey="E" currentMode={bridge.transformMode} onSelect={(m) => editor.setTransformMode(m)} />
      <TransformBtn mode="scale" label="Scale" hotkey="R" currentMode={bridge.transformMode} onSelect={(m) => editor.setTransformMode(m)} />

      <ErrorDialog
        open={!!errorMsg()}
        title={errorTitle()}
        message={errorMsg()}
        onClose={() => setErrorMsg('')}
      />
    </div>
  );
};

// ── Sub-components ──────────────────────────────

const ToolbarBtn: Component<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}> = (props) => (
  <button
    onClick={props.onClick}
    disabled={props.disabled}
    title={props.title}
    class={styles.toolbarBtn}
  >
    {props.label}
  </button>
);

const TransformBtn: Component<{
  mode: TransformMode;
  label: string;
  hotkey: string;
  currentMode: () => TransformMode;
  onSelect: (m: TransformMode) => void;
}> = (props) => (
  <button
    onClick={() => props.onSelect(props.mode)}
    title={`${props.label} (${props.hotkey})`}
    class={styles.transformBtn}
    classList={{ [styles.active]: props.currentMode() === props.mode }}
  >
    {props.label}
  </button>
);
