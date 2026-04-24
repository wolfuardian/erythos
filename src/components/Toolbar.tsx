import { type Component, createSignal } from 'solid-js';
import { ErrorDialog } from './ErrorDialog';
import { loadGLTFFromFile } from '../utils/gltfLoader';
import { useEditor } from '../app/EditorContext';
import { AddNodeCommand } from '../core/commands/AddNodeCommand';
import type { TransformMode } from '../core/EventEmitter';
import { clearSavedLayout } from '../app/workspaceStore';

export const Toolbar: Component = () => {
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
    const json = JSON.stringify(editor.sceneDocument.serialize());

    if (editor.projectManager.isOpen) {
      try {
        await editor.projectManager.writeFile('scene.erythos', json);
      } catch (e: any) {
        setErrorTitle('Save Failed');
        setErrorMsg(e.message || String(e));
      }
      return;
    }

    // Fallback：瀏覽器下載
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scene-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.scene`;
    a.click();
    URL.revokeObjectURL(url);
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
        editor.loadScene(parsed);
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

  const transformBtn = (mode: TransformMode, label: string, hotkey: string) => (
    <button
      onClick={() => editor.setTransformMode(mode)}
      title={`${label} (${hotkey})`}
      style={{
        padding: '2px 8px',
        height: '24px',
        background: bridge.transformMode() === mode ? 'var(--accent-blue)' : 'var(--bg-section)',
        color: bridge.transformMode() === mode ? '#fff' : 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
        'border-radius': 'var(--radius-sm)',
        'font-size': 'var(--font-size-sm)',
        cursor: 'pointer',
        transition: 'background var(--transition-fast)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      data-devid="toolbar"
      style={{
      height: 'var(--toolbar-height)',
      background: 'var(--bg-header)',
      'border-bottom': '1px solid var(--border-subtle)',
      display: 'flex',
      'align-items': 'center',
      padding: '0 var(--space-md)',
      gap: 'var(--space-sm)',
    }}>
      {/* Brand */}
      <span style={{
        color: 'var(--accent-blue)',
        'font-weight': 'bold',
        'font-size': 'var(--font-size-lg)',
        'margin-right': 'var(--space-md)',
      }}>
        Erythos
      </span>

      <Divider />

      {/* File operations */}
      <ToolbarBtn label="New" onClick={() => editor.clear()} title="New Scene" />
      <ToolbarBtn label="Undo" onClick={() => editor.undo()} disabled={!bridge.canUndo()} title="Undo (Ctrl+Z)" />
      <ToolbarBtn label="Redo" onClick={() => editor.redo()} disabled={!bridge.canRedo()} title="Redo (Ctrl+Y)" />

      <Divider />

      {/* Add objects */}
      <ToolbarBtn label="+ Cube" onClick={() => addObject('cube')} />
      <ToolbarBtn label="+ Sphere" onClick={() => addObject('sphere')} />
      <ToolbarBtn label="+ Plane" onClick={() => addObject('plane')} />
      <ToolbarBtn label="+ Cylinder" onClick={() => addObject('cylinder')} />
      <ToolbarBtn label="+ Light" onClick={() => addObject('directional-light')} />
      <ToolbarBtn label="+ Ambient" onClick={() => addObject('ambient-light')} />
      <ToolbarBtn label="+ Camera" onClick={() => addObject('camera')} />
      <ToolbarBtn label="+ Group" onClick={() => addObject('group')} />

      <Divider />

      {/* Import */}
      <ToolbarBtn label="Import" onClick={handleImport} disabled={importing()} title="Import GLTF/GLB" />
      <ToolbarBtn label="Save" onClick={handleSave} title="Save Scene" />
      <ToolbarBtn label="Load" onClick={handleLoad} disabled={loading()} title="Load Scene" />

      <Divider />

      {/* Transform mode */}
      {transformBtn('translate', 'Move', 'W')}
      {transformBtn('rotate', 'Rotate', 'E')}
      {transformBtn('scale', 'Scale', 'R')}

      <Divider />

      {/* Reset layout */}
      <ToolbarBtn
        label="Reset Layout"
        onClick={() => { clearSavedLayout(); location.reload(); }}
        title="Reset panel layout to default"
      />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      <span style={{ color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)' }}>
        v{__APP_VERSION__}
      </span>

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
    style={{
      padding: '2px 8px',
      height: '24px',
      background: 'var(--bg-section)',
      color: props.disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
      border: '1px solid var(--border-subtle)',
      'border-radius': 'var(--radius-sm)',
      'font-size': 'var(--font-size-sm)',
      cursor: props.disabled ? 'default' : 'pointer',
      transition: 'background var(--transition-fast)',
    }}
  >
    {props.label}
  </button>
);

const Divider: Component = () => (
  <div style={{
    width: '1px',
    height: '18px',
    background: 'var(--border-medium)',
    margin: '0 var(--space-xs)',
  }} />
);
