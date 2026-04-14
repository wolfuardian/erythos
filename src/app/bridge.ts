import { createSignal, type Accessor } from 'solid-js';
import type { Editor } from '../core/Editor';
import type { InteractionMode, TransformMode } from '../core/EventEmitter';
import type { SceneNode } from '../core/scene/SceneFormat';
import type { LeafAsset } from '../core/scene/LeafFormat';

export const CONFIRM_LOAD_KEY = 'erythos-settings-confirmLoad';
const [confirmBeforeLoad, _setConfirmBeforeLoad] = createSignal<boolean>(
  localStorage.getItem(CONFIRM_LOAD_KEY) !== 'false',
);

export function setConfirmBeforeLoad(value: boolean): void {
  localStorage.setItem(CONFIRM_LOAD_KEY, String(value));
  _setConfirmBeforeLoad(value);
}

export interface EditorBridge {
  editor: Editor;
  selectedUUIDs: Accessor<string[]>;
  hoveredUUID: Accessor<string | null>;
  nodes: Accessor<SceneNode[]>;
  getNode: (uuid: string) => SceneNode | null;
  interactionMode: Accessor<InteractionMode>;
  transformMode: Accessor<TransformMode>;
  sceneVersion: Accessor<number>;
  objectVersion: Accessor<number>;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  autosaveStatus: Accessor<'idle' | 'pending' | 'saved'>;
  confirmBeforeLoad: Accessor<boolean>;
  hasClipboard: Accessor<boolean>;
  leafAssets: Accessor<LeafAsset[]>;
  dispose: () => void;
}

export function createEditorBridge(editor: Editor): EditorBridge {
  const [selectedUUIDs, setSelectedUUIDs] = createSignal<string[]>([]);
  const [hoveredUUID, setHoveredUUID] = createSignal<string | null>(null);
  const [nodes, setNodes] = createSignal<SceneNode[]>([]);
  const [interactionMode, setMode] = createSignal<InteractionMode>('object');
  const [transformMode, setTransformMode] = createSignal<TransformMode>('translate');
  const [sceneVersion, setSceneVersion] = createSignal(0);
  const [objectVersion, setObjectVersion] = createSignal(0);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [autosaveStatus, setAutosaveStatus] = createSignal<'idle' | 'pending' | 'saved'>('idle');
  const [hasClipboard, setHasClipboard] = createSignal(false);
  const [leafAssets, setLeafAssets] = createSignal<LeafAsset[]>(editor.getAllLeafAssets());

  const bump = (setter: (fn: (v: number) => number) => void) =>
    setter((v) => v + 1);

  // Editor UI-state event handlers
  const editorHandlers = {
    selectionChanged: (uuids: string[]) => setSelectedUUIDs(uuids),
    hoverChanged: (uuid: string | null) => setHoveredUUID(uuid),
    interactionModeChanged: (mode: InteractionMode) => setMode(mode),
    transformModeChanged: (mode: TransformMode) => setTransformMode(mode),
    historyChanged: () => {
      setCanUndo(editor.history.canUndo);
      setCanRedo(editor.history.canRedo);
    },
    autosaveStatusChanged: (status: 'idle' | 'pending' | 'saved') => setAutosaveStatus(status),
  } as const;

  // SceneDocument event handlers — Commands operate on SceneDocument directly,
  // so only these events capture all scene changes (not editor.events).
  const onNodeAdded = (_node: SceneNode) => setNodes(editor.sceneDocument.getAllNodes());
  const onNodeRemoved = (_node: SceneNode) => setNodes(editor.sceneDocument.getAllNodes());
  const onNodeChanged = (_uuid: string, _changed: Partial<SceneNode>) => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setObjectVersion);
  };
  const onSceneReplaced = () => {
    setNodes(editor.sceneDocument.getAllNodes());
    bump(setSceneVersion);
  };

  // Subscribe to editor events
  for (const [event, handler] of Object.entries(editorHandlers)) {
    editor.events.on(event as any, handler as any);
  }

  // Subscribe to SceneDocument events
  editor.sceneDocument.events.on('nodeAdded', onNodeAdded);
  editor.sceneDocument.events.on('nodeRemoved', onNodeRemoved);
  editor.sceneDocument.events.on('nodeChanged', onNodeChanged);
  editor.sceneDocument.events.on('sceneReplaced', onSceneReplaced);

  // Subscribe to Clipboard events
  const onClipboardChanged = () => setHasClipboard(editor.clipboard.hasContent);
  editor.clipboard.on('clipboardChanged', onClipboardChanged);

  // Subscribe to LeafStore events
  const onLeafStoreChanged = () => setLeafAssets(editor.getAllLeafAssets());
  editor.events.on('leafStoreChanged', onLeafStoreChanged);

  const dispose = () => {
    for (const [event, handler] of Object.entries(editorHandlers)) {
      editor.events.off(event as any, handler as any);
    }
    editor.sceneDocument.events.off('nodeAdded', onNodeAdded);
    editor.sceneDocument.events.off('nodeRemoved', onNodeRemoved);
    editor.sceneDocument.events.off('nodeChanged', onNodeChanged);
    editor.sceneDocument.events.off('sceneReplaced', onSceneReplaced);
    editor.clipboard.off('clipboardChanged', onClipboardChanged);
    editor.events.off('leafStoreChanged', onLeafStoreChanged);
  };

  return {
    editor,
    selectedUUIDs,
    hoveredUUID,
    nodes,
    getNode: (uuid) => editor.sceneDocument.getNode(uuid),
    interactionMode,
    transformMode,
    sceneVersion,
    objectVersion,
    canUndo,
    canRedo,
    autosaveStatus,
    confirmBeforeLoad,
    hasClipboard,
    leafAssets,
    dispose,
  };
}
