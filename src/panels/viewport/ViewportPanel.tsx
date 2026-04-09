import { onMount, onCleanup, createEffect, type Component } from 'solid-js';
import { Viewport } from '../../viewport/Viewport';
import { useEditor } from '../../app/EditorContext';
import { SetPositionCommand } from '../../core/commands/SetPositionCommand';
import { SetRotationCommand } from '../../core/commands/SetRotationCommand';
import { SetScaleCommand } from '../../core/commands/SetScaleCommand';

const ViewportPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  let containerRef!: HTMLDivElement;
  let viewport: Viewport | null = null;

  onMount(() => {
    viewport = new Viewport(editor.scene, {
      onSelect: (obj) => editor.selection.select(obj),
      onHover: (obj) => editor.selection.hover(obj),
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
    const obj = bridge.selectedObject();
    viewport?.setSelectedObject(obj);
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
      }}
    />
  );
};

export default ViewportPanel;
