import { createSignal, For, Show, onMount, onCleanup, type Component } from 'solid-js';
import { loadGLTFFromFile } from '../../utils/gltfLoader';
import type { SceneNode } from '../../core/scene/SceneFormat';
import { useEditor } from '../../app/EditorContext';
import type { NodeUUID } from '../../utils/branded';
import { AddNodeCommand } from '../../core/commands/AddNodeCommand';
import { RemoveNodeCommand } from '../../core/commands/RemoveNodeCommand';
import { MultiCmdsCommand } from '../../core/commands/MultiCmdsCommand';
import { SaveAsPrefabCommand } from '../../core/commands/SaveAsPrefabCommand';
import { ContextMenu } from '../../components/ContextMenu';
import { PanelHeader } from '../../components/PanelHeader';
import { useAreaState } from '../../app/areaState';
import { TreeNode, type DropIndicator } from './TreeNode';
import { buildSceneTreeMenuItems } from './sceneTreeMenuItems';
import { HeaderToolBar } from './HeaderToolBar';
import styles from './SceneTreePanel.module.css';

const SceneTreePanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [draggedId, setDraggedId] = createSignal<NodeUUID | null>(null);
  const [dropIndicator, setDropIndicator] = createSignal<DropIndicator | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);
  const [expandedMap, setExpandedMap] = useAreaState<Record<string, boolean>>('expandedMap', {});
  const [isFileDragging, setIsFileDragging] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');

  // Visual-only toggle state (P2/P3 will connect these to scene model)
  const [eyeOffMap, setEyeOffMap] = createSignal<Record<string, boolean>>({});
  const [cursorOffMap, setCursorOffMap] = createSignal<Record<string, boolean>>({});

  const isExpanded = (id: string): boolean => expandedMap()[id] ?? false;

  const toggleExpanded = (id: string): void => {
    setExpandedMap(prev => ({ ...prev, [id]: !(prev[id] ?? false) }));
  };

  const setNodeExpanded = (id: string, value: boolean): void => {
    setExpandedMap(prev => ({ ...prev, [id]: value }));
  };

  const flatVisibleNodes = (): SceneNode[] => {
    const result: SceneNode[] = [];
    const visit = (parentId: string | null) => {
      const children = bridge.nodes()
        .filter(n => n.parent === parentId)
        .sort((a, b) => a.order - b.order);
      for (const child of children) {
        result.push(child);
        if (isExpanded(child.id)) {
          visit(child.id);
        }
      }
    };
    visit(null);
    return result;
  };

  const rootNodes = () =>
    bridge.nodes()
      .filter(n => n.parent === null)
      .sort((a, b) => a.order - b.order)
      .filter(n => { const q = searchQuery(); return q === '' || n.name.toLowerCase().includes(q.toLowerCase()); });

  const createPrimitive = (type: string, name: string) => {
    const node = editor.sceneDocument.createNode(name);
    node.components = {
      geometry: { type },
      material: { color: 0xcccccc },
    };
    editor.execute(new AddNodeCommand(editor, node));
    editor.selection.select(node.id);
  };

  const collectSubtree = (rootId: NodeUUID): SceneNode[] => {
    const all = editor.sceneDocument.getAllNodes();
    const result: SceneNode[] = [];
    const queue: NodeUUID[] = [rootId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const node = editor.sceneDocument.getNode(cur);
      if (node) {
        result.push(node);
        all.filter(n => n.parent === cur).forEach(n => queue.push(n.id));
      }
    }
    return result;
  };

  const handleCreateEmpty = () => {
    const node = editor.sceneDocument.createNode('Empty');
    editor.execute(new AddNodeCommand(editor, node));
    editor.selection.select(node.id);
  };

  const handleDelete = () => {
    const ids = bridge.selectedUUIDs();
    const topLevel = ids.filter(id => {
      let cursor = editor.sceneDocument.getNode(id)?.parent;
      while (cursor) {
        if (ids.includes(cursor)) return false;
        cursor = editor.sceneDocument.getNode(cursor)?.parent ?? null;
      }
      return true;
    });
    if (topLevel.length === 1) {
      editor.execute(new RemoveNodeCommand(editor, topLevel[0]));
    } else if (topLevel.length > 1) {
      const cmds = topLevel.map(id => new RemoveNodeCommand(editor, id));
      editor.execute(new MultiCmdsCommand(editor, cmds));
    }
    editor.selection.select(null);
  };

  const handleSaveAsPrefab = () => {
    const selected = bridge.selectedUUIDs();
    const uuid = selected[0];
    const node = editor.sceneDocument.getNode(uuid);
    if (!node) return;
    editor.execute(new SaveAsPrefabCommand(editor, uuid, node.name));
  };

  const handleCopy = () => {
    const selected = bridge.selectedUUIDs();
    const topLevel = selected.filter(id => {
      let cursor = editor.sceneDocument.getNode(id)?.parent;
      while (cursor) {
        if (selected.includes(cursor)) return false;
        cursor = editor.sceneDocument.getNode(cursor)?.parent ?? null;
      }
      return true;
    });
    const allNodes = topLevel.flatMap(id => collectSubtree(id));
    editor.clipboard.copy(allNodes);
  };

  const handleCut = () => {
    const selected = bridge.selectedUUIDs();
    const topLevel = selected.filter(id => {
      let cursor = editor.sceneDocument.getNode(id)?.parent;
      while (cursor) {
        if (selected.includes(cursor)) return false;
        cursor = editor.sceneDocument.getNode(cursor)?.parent ?? null;
      }
      return true;
    });
    const allNodes = topLevel.flatMap(id => collectSubtree(id));
    editor.clipboard.cut(allNodes);
    if (topLevel.length === 1) {
      editor.execute(new RemoveNodeCommand(editor, topLevel[0]));
    } else if (topLevel.length > 1) {
      const cmds = topLevel.map(id => new RemoveNodeCommand(editor, id));
      editor.execute(new MultiCmdsCommand(editor, cmds));
    }
    editor.selection.select(null);
  };

  const handlePaste = () => {
    const nodes = editor.clipboard.paste();
    if (!nodes || nodes.length === 0) return;

    const selected = bridge.selectedUUIDs();
    if (selected.length === 1) {
      const parentId = selected[0];
      const existingChildren = bridge.nodes().filter(n => n.parent === parentId);
      const maxOrder = existingChildren.length > 0
        ? Math.max(...existingChildren.map(n => n.order))
        : -1;
      let offset = 1;
      for (const node of nodes) {
        if (node.parent === null) {
          node.parent = parentId;
          node.order = maxOrder + offset;
          offset++;
        }
      }
    }

    const cmds = nodes.map(n => new AddNodeCommand(editor, n));
    if (cmds.length === 1) {
      editor.execute(cmds[0]);
    } else {
      editor.execute(new MultiCmdsCommand(editor, cmds));
    }
    editor.selection.select(null);
    for (const n of nodes) {
      editor.selection.add(n.id);
    }
  };

  let containerRef!: HTMLDivElement;

  onMount(() => {
    const panelEl = containerRef;

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setIsFileDragging(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!panelEl.contains(e.relatedTarget as Node)) {
        setIsFileDragging(false);
      }
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsFileDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const gltfFile = files.find(f => /\.(glb|gltf)$/i.test(f.name));
      if (!gltfFile) return;
      try {
        await loadGLTFFromFile(gltfFile, editor);
      } catch (err) {
        console.error('Failed to import GLB:', err);
      }
    };

    panelEl.addEventListener('dragover', onDragOver);
    panelEl.addEventListener('dragenter', onDragEnter);
    panelEl.addEventListener('dragleave', onDragLeave);
    panelEl.addEventListener('drop', onDrop);

    onCleanup(() => {
      panelEl.removeEventListener('dragover', onDragOver);
      panelEl.removeEventListener('dragenter', onDragEnter);
      panelEl.removeEventListener('dragleave', onDragLeave);
      panelEl.removeEventListener('drop', onDrop);
    });
  });

  return (
    <div
      data-testid="scene-tree-panel"
      class={styles.panel}
    >
      {/* Header */}
      <PanelHeader title="Scene" />
      <HeaderToolBar onSearchChange={setSearchQuery} />

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) return;

          const flat = flatVisibleNodes();
          const selected = bridge.selectedUUIDs();
          const currentId = selected.length > 0 ? selected[selected.length - 1] : null;
          const currentIdx = currentId ? flat.findIndex(n => n.id === currentId) : -1;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const candidates = flat.slice(currentIdx + 1);
            if (candidates.length > 0) editor.selection.select(candidates[0].id);
            else if (currentIdx === -1 && flat.length > 0) {
              editor.selection.select(flat[0].id);
            }
          }

          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const candidates = flat.slice(0, currentIdx > 0 ? currentIdx : 0);
            if (candidates.length > 0) editor.selection.select(candidates[candidates.length - 1].id);
          }

          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (!currentId) return;
            const node = flat.find(n => n.id === currentId);
            if (!node) return;
            const hasKids = bridge.nodes().some(n => n.parent === currentId);
            if (hasKids && isExpanded(currentId)) {
              setNodeExpanded(currentId, false);
            } else if (node.parent) {
              editor.selection.select(node.parent);
            }
          }

          if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (!currentId) return;
            const hasKids = bridge.nodes().some(n => n.parent === currentId);
            if (!hasKids) return;
            if (!isExpanded(currentId)) {
              setNodeExpanded(currentId, true);
            } else {
              const children = bridge.nodes()
                .filter(n => n.parent === currentId)
                .sort((a, b) => a.order - b.order);
              if (children.length > 0) editor.selection.select(children[0].id);
            }
          }
        }}
        onClick={(e) => {
          if (!(e.target as Element).closest('[draggable]')) {
            editor.selection.select(null);
          }
          containerRef.focus();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!(e.target as Element).closest('[draggable]')) {
            editor.selection.select(null);
          }
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        class={styles.scrollArea}
      >
        <For each={rootNodes()}>
          {(node) => (
            <TreeNode
              node={node}
              depth={0}
              lineageHasMoreSiblings={[]}
              draggedId={draggedId}
              dropIndicator={dropIndicator}
              setDraggedId={setDraggedId}
              setDropIndicator={setDropIndicator}
              isExpanded={isExpanded}
              toggleExpanded={toggleExpanded}
              eyeOffMap={eyeOffMap}
              setEyeOffMap={setEyeOffMap}
              cursorOffMap={cursorOffMap}
              setCursorOffMap={setCursorOffMap}
            />
          )}
        </For>
        <Show when={rootNodes().length === 0}>
          <div class={styles.emptyHint}>
            Empty scene
          </div>
        </Show>
        <Show when={contextMenu()}>
          <ContextMenu
            items={buildSceneTreeMenuItems({
              selected: bridge.selectedUUIDs,
              hasClipboard: bridge.hasClipboard,
              onCreateEmpty: handleCreateEmpty,
              onCreatePrimitive: createPrimitive,
              onDelete: handleDelete,
              onSaveAsPrefab: handleSaveAsPrefab,
              onCopy: handleCopy,
              onCut: handleCut,
              onPaste: handlePaste,
            })}
            position={contextMenu()!}
            onClose={() => setContextMenu(null)}
            align={{ itemIndex: 0, xPercent: 0.65 }}
          />
        </Show>
        <Show when={isFileDragging()}>
          <div class={styles.fileDragOverlay}>
            Drop GLB to import
          </div>
        </Show>
      </div>
    </div>
  );
};

export default SceneTreePanel;
