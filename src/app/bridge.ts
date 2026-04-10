import { createSignal, type Accessor } from 'solid-js';
import type { Object3D } from 'three';
import type { Editor } from '../core/Editor';
import type { InteractionMode, TransformMode } from '../core/EventEmitter';

export interface EditorBridge {
  editor: Editor;
  selectedObjects: Accessor<Object3D[]>;
  hoveredObject: Accessor<Object3D | null>;
  interactionMode: Accessor<InteractionMode>;
  transformMode: Accessor<TransformMode>;
  sceneVersion: Accessor<number>;
  objectVersion: Accessor<number>;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  dispose: () => void;
}

export function createEditorBridge(editor: Editor): EditorBridge {
  const [selectedObjects, setSelectedObjects] = createSignal<Object3D[]>([]);
  const [hoveredObject, setHovered] = createSignal<Object3D | null>(null);
  const [interactionMode, setMode] = createSignal<InteractionMode>('object');
  const [transformMode, setTransformMode] = createSignal<TransformMode>('translate');
  const [sceneVersion, setSceneVersion] = createSignal(0);
  const [objectVersion, setObjectVersion] = createSignal(0);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);

  const bump = (setter: (fn: (v: number) => number) => void) =>
    setter((v) => v + 1);

  const handlers = {
    selectionChanged: (objects: Object3D[]) => setSelectedObjects(objects),
    objectHovered: (obj: Object3D | null) => setHovered(obj),
    interactionModeChanged: (mode: InteractionMode) => setMode(mode),
    transformModeChanged: (mode: TransformMode) => setTransformMode(mode),
    sceneGraphChanged: () => bump(setSceneVersion),
    objectChanged: () => bump(setObjectVersion),
    historyChanged: () => {
      setCanUndo(editor.history.canUndo);
      setCanRedo(editor.history.canRedo);
    },
  } as const;

  // Subscribe
  for (const [event, handler] of Object.entries(handlers)) {
    editor.events.on(event as any, handler as any);
  }

  const dispose = () => {
    for (const [event, handler] of Object.entries(handlers)) {
      editor.events.off(event as any, handler as any);
    }
  };

  return {
    editor,
    selectedObjects,
    hoveredObject,
    interactionMode,
    transformMode,
    sceneVersion,
    objectVersion,
    canUndo,
    canRedo,
    dispose,
  };
}
