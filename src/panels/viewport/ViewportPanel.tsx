import { onMount, onCleanup, createEffect, createSignal, Show, type Component } from 'solid-js';
import { Viewport } from '../../viewport/Viewport';
import { useEditor } from '../../app/EditorContext';
import { SetPositionCommand } from '../../core/commands/SetPositionCommand';
import { SetRotationCommand } from '../../core/commands/SetRotationCommand';
import { SetScaleCommand } from '../../core/commands/SetScaleCommand';
import { loadGLTFFromFile } from '../../utils/gltfLoader';
import { ErrorDialog } from '../../components/ErrorDialog';

const ViewportPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  let containerRef!: HTMLDivElement;
  let viewport: Viewport | null = null;

  const [isDragging, setIsDragging] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  onMount(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!containerRef.contains(e.relatedTarget as Node)) {
        setIsDragging(false);
      }
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files ?? []);
      const gltfFile = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
      if (!gltfFile) return;

      try {
        await loadGLTFFromFile(gltfFile, editor);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'f' || e.key === 'F') {
        const objects = bridge.selectedObjects();
        const primary = objects.length > 0 ? objects[objects.length - 1] : null;
        if (primary && viewport) {
          viewport.focusObject(primary);
        }
      }

      if (e.key === 'w' || e.key === 'W') {
        editor.setTransformMode('translate');
      }
      if (e.key === 'e' || e.key === 'E') {
        editor.setTransformMode('rotate');
      }
      if (e.key === 'r' || e.key === 'R') {
        editor.setTransformMode('scale');
      }
    };

    containerRef.addEventListener('dragover', onDragOver);
    containerRef.addEventListener('dragenter', onDragEnter);
    containerRef.addEventListener('dragleave', onDragLeave);
    containerRef.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);

    onCleanup(() => {
      containerRef.removeEventListener('dragover', onDragOver);
      containerRef.removeEventListener('dragenter', onDragEnter);
      containerRef.removeEventListener('dragleave', onDragLeave);
      containerRef.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
    });

    viewport = new Viewport(editor.scene, {
      onSelect: (obj, modifier) => {
        if (modifier.ctrl && obj) {
          editor.selection.toggle(obj);
        } else {
          editor.selection.select(obj);
        }
      },
      onHover: (obj) => editor.selection.hover(obj),
      onMultiTransformEnd: (objects, startTransforms) => {
        for (let i = 0; i < objects.length; i++) {
          const obj = objects[i];
          const start = startTransforms[i];
          if (!obj.position.equals(start.pos)) {
            editor.execute(new SetPositionCommand(editor, obj, obj.position.clone(), start.pos));
          }
          if (!obj.rotation.equals(start.rot)) {
            editor.execute(new SetRotationCommand(editor, obj, obj.rotation.clone(), start.rot));
          }
          if (!obj.scale.equals(start.scale)) {
            editor.execute(new SetScaleCommand(editor, obj, obj.scale.clone(), start.scale));
          }
        }
      },
      onTransformEnd: (obj, startPos, startRot, startScale) => {
        // Create appropriate command based on what changed
        if (!obj.position.equals(startPos)) {
          editor.execute(new SetPositionCommand(editor, obj, obj.position.clone(), startPos));
        }
        if (!obj.rotation.equals(startRot)) {
          editor.execute(new SetRotationCommand(editor, obj, obj.rotation.clone(), startRot));
        }
        if (!obj.scale.equals(startScale)) {
          editor.execute(new SetScaleCommand(editor, obj, obj.scale.clone(), startScale));
        }
      },
    });

    viewport.mount(containerRef);
  });

  // Sync selection → viewport
  createEffect(() => {
    const objects = bridge.selectedObjects();
    viewport?.setSelectedObjects(objects);
  });

  createEffect(() => {
    const obj = bridge.hoveredObject();
    viewport?.setHoveredObject(obj);
  });

  createEffect(() => {
    const mode = bridge.transformMode();
    viewport?.setTransformMode(mode);
  });

  // Re-render when scene changes
  createEffect(() => {
    bridge.sceneVersion();
    bridge.objectVersion();
    viewport?.requestRender();
  });

  onCleanup(() => {
    viewport?.dispose();
    viewport = null;
  });

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-app)',
        position: 'relative',
      }}
    >
      <Show when={isDragging()}>
        <div
          style={{
            position: 'absolute',
            inset: '0',
            background: 'rgba(100, 149, 237, 0.25)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-size': '18px',
            color: 'var(--text-primary, #fff)',
            'pointer-events': 'none',
            'z-index': '10',
            border: '2px dashed rgba(100, 149, 237, 0.7)',
          }}
        >
          放開以導入模型
        </div>
      </Show>
      <ErrorDialog
        open={errorMessage() !== null}
        title="導入失敗"
        message={errorMessage() ?? ''}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
};

export default ViewportPanel;
