import {
  createSignal, onMount, onCleanup, type Component,
} from 'solid-js';
import {
  Scene, WebGLRenderer, PerspectiveCamera,
  DirectionalLight, AmbientLight,
  ACESFilmicToneMapping,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEditor } from '../../app/EditorContext';
import { PanelHeader } from '../../components/PanelHeader';
import { PromptDialog } from '../../components/PromptDialog';
import { SceneDocument } from '../../core/scene/SceneDocument';
import { History } from '../../core/History';
import { EventEmitter } from '../../core/EventEmitter';
import { SceneSync } from '../../core/scene/SceneSync';
import { deserializeFromPrefab, serializeToPrefab } from '../../core/scene/PrefabSerializer';
import { prefabPathForName } from '../../utils/prefabPath';
import { SaveAsPrefabCommand } from '../../core/commands/SaveAsPrefabCommand';
import { generateUUID } from '../../utils/uuid';
import type { ProjectFile } from '../../core/project/ProjectFile';
import type { SceneNode } from '../../core/scene/SceneFormat';
import AssetBrowser from './AssetBrowser';
import styles from './WorkshopPanel.module.css';

const WorkshopPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  // ── Sandbox lifecycle refs (all panel-local) ─────────────────────────────
  let viewportRef!: HTMLDivElement;
  let renderer: WebGLRenderer | null = null;
  let camera: PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let sandboxSceneSync: SceneSync | null = null;
  let animFrameId = 0;
  let resizeObserver: ResizeObserver | null = null;

  // Panel-local sandbox instances (new per mount)
  let sandboxDocument: SceneDocument;
  let sandboxHistory: History;

  // ── Reactive state ───────────────────────────────────────────────────────
  const [currentPrefabPath, setCurrentPrefabPath] = createSignal<string | null>(null);
  const [statusText, setStatusText] = createSignal('Empty sandbox');
  const [isDragOver, setIsDragOver] = createSignal(false);
  const [showNamePrompt, setShowNamePrompt] = createSignal(false);

  // ── Mount / Cleanup ──────────────────────────────────────────────────────
  onMount(() => {
    // Create sandbox instances
    sandboxDocument = new SceneDocument();
    const sandboxEvents = new EventEmitter();
    sandboxHistory = new History(sandboxEvents);

    // Three.js scene
    const sandboxScene = new Scene();

    // SceneSync wires sandboxDocument → sandboxScene, shares main editor's resourceCache
    sandboxSceneSync = new SceneSync(sandboxDocument, sandboxScene, editor.resourceCache);

    // Renderer
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x282828);
    viewportRef.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    // Lights
    const ambient = new AmbientLight(0xffffff, 0.5);
    const dirLight = new DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 4, 3);
    sandboxScene.add(ambient, dirLight);

    // Camera + controls
    camera = new PerspectiveCamera(45, 1, 0.001, 1000);
    camera.position.set(0, 1.5, 4);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    // Size management
    const updateSize = () => {
      if (!renderer || !camera) return;
      const w = viewportRef.clientWidth;
      const h = viewportRef.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(viewportRef);
    updateSize();

    // Render loop
    const loop = () => {
      animFrameId = requestAnimationFrame(loop);
      controls?.update();
      if (renderer && sandboxScene && camera) {
        renderer.render(sandboxScene, camera);
      }
    };
    loop();
  });

  onCleanup(() => {
    cancelAnimationFrame(animFrameId);
    resizeObserver?.disconnect();
    controls?.dispose();
    sandboxSceneSync?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
  });

  // ── Drop handler helpers ──────────────────────────────────────────────────

  /** Derive a deduped prefab name: if 'foo.prefab' already exists, try 'foo (copy)', 'foo (copy 2)', etc. */
  const nextAvailablePrefabName = (baseName: string): string => {
    const existingPaths = editor.projectManager.getFiles().map(f => f.path);
    if (!existingPaths.includes(prefabPathForName(baseName))) return baseName;
    let candidate = `${baseName} (copy)`;
    if (!existingPaths.includes(prefabPathForName(candidate))) return candidate;
    let n = 2;
    while (existingPaths.includes(prefabPathForName(`${baseName} (copy ${n})`))) n++;
    return `${baseName} (copy ${n})`;
  };

  // ── Drop handler ──────────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent) => {
    const types = e.dataTransfer?.types ?? [];
    if (!types.includes('application/erythos-asset') && !types.includes('application/erythos-scene-subtree')) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // ── Scene-subtree drop: create prefab from main scene node ────────────
    const subtreeRaw = e.dataTransfer?.getData('application/erythos-scene-subtree');
    if (subtreeRaw) {
      let subtreePayload: { rootUUID: string };
      try {
        subtreePayload = JSON.parse(subtreeRaw) as { rootUUID: string };
      } catch {
        return;
      }

      const { rootUUID } = subtreePayload;
      const rootNode = editor.sceneDocument.getNode(rootUUID);
      if (!rootNode) {
        console.warn(`[Workshop] scene-subtree drop: node ${rootUUID} not found`);
        return;
      }

      const derivedName = nextAvailablePrefabName(rootNode.name);
      const targetPath = prefabPathForName(derivedName);

      setStatusText(`Creating prefab "${derivedName}"…`);

      // Execute SaveAsPrefabCommand on the main editor. This:
      //   1. Serializes the subtree → PrefabAsset
      //   2. Writes .prefab file (async, fire-and-forget via registerPrefab)
      //   3. Tags root node with components.prefab = { path }
      // Live-sync: fileChanged → PrefabRegistry.refetch → prefabChanged →
      //   SceneSync._rebuildPrefabInstances removes existing children and
      //   re-adds from the new prefab content.
      editor.execute(new SaveAsPrefabCommand(editor, rootUUID, derivedName));

      // Wait for the file to be written + registry updated (prefabStoreChanged fires after rescan).
      await new Promise<void>((resolve) => {
        const onReady = () => {
          editor.events.off('prefabStoreChanged', onReady);
          resolve();
        };
        editor.events.on('prefabStoreChanged', onReady);
        // Safety timeout: if the event never fires (e.g. project closed), resolve after 3s.
        setTimeout(() => {
          editor.events.off('prefabStoreChanged', onReady);
          resolve();
        }, 3000);
      });

      // Open the newly created prefab in Workshop
      const prefabFile = editor.projectManager.getFiles().find(f => f.path === targetPath);
      if (prefabFile) {
        await handleOpenPrefab(prefabFile);
      } else {
        // File write may have failed — just reflect status
        setStatusText(`Prefab "${derivedName}" created (not found in project files)`);
      }
      return;
    }

    // ── Asset (GLB) drop: add mesh node to sandbox ────────────────────────
    const raw = e.dataTransfer?.getData('application/erythos-asset');
    if (!raw) return;

    let payload: { type: string; path: string };
    try {
      payload = JSON.parse(raw) as { type: string; path: string };
    } catch {
      return;
    }
    if (payload.type !== 'glb') return;

    const { path } = payload;

    // Resolve URL from projectManager
    let url: string;
    try {
      url = await editor.projectManager.urlFor(path);
    } catch {
      console.warn(`[Workshop] urlFor failed for path: ${path}`);
      return;
    }

    // Load into shared resourceCache if not already present
    if (!editor.resourceCache.has(url)) {
      try {
        await editor.resourceCache.loadFromURL(url);
      } catch {
        console.warn(`[Workshop] resourceCache.loadFromURL failed for: ${url}`);
        return;
      }
    }

    // Add mesh node to sandbox (no History entry for P2 — direct mutation)
    const node = sandboxDocument.createNode(path.split('/').pop() ?? path);
    node.components = { mesh: { url, path } };
    sandboxDocument.addNode(node);

    setStatusText(currentPrefabPath()
      ? `Editing: ${currentPrefabPath()} (unsaved)`
      : 'Unsaved sandbox — click Save to write to disk');
  };

  // ── Open prefab action ───────────────────────────────────────────────────

  const handleOpenPrefab = async (file: ProjectFile) => {
    // Warn if sandbox has content
    if (sandboxDocument.getAllNodes().length > 0) {
      if (!window.confirm('Discard current sandbox content?')) return;
    }

    let url: string;
    try {
      url = await editor.projectManager.urlFor(file.path);
    } catch {
      console.warn(`[Workshop] urlFor failed for prefab: ${file.path}`);
      return;
    }

    let prefabAsset;
    try {
      prefabAsset = await editor.prefabRegistry.loadFromURL(url, file.path);
    } catch {
      console.warn(`[Workshop] failed to load prefab: ${file.path}`);
      return;
    }

    // Deserialize PrefabAsset → SceneNode[] then load into sandbox via SceneDocument
    const nodes = deserializeFromPrefab(prefabAsset, null);
    // Hydrate mesh URLs from projectManager
    for (const node of nodes) {
      const mesh = node.components['mesh'] as { path?: string; url?: string } | undefined;
      if (mesh?.path && !mesh.url) {
        try {
          const meshUrl = await editor.projectManager.urlFor(mesh.path);
          // Ensure cached
          if (!editor.resourceCache.has(meshUrl)) {
            await editor.resourceCache.loadFromURL(meshUrl);
          }
          (node.components['mesh'] as Record<string, unknown>)['url'] = meshUrl;
        } catch {
          // soft-fail — SceneSync will skip this mesh
        }
      }
    }

    // Replace sandbox content atomically
    sandboxDocument.deserialize({ version: 1, nodes });
    sandboxHistory.clear();
    setCurrentPrefabPath(file.path);
    setStatusText(`Editing: ${file.path}`);
  };

  // ── Discard ──────────────────────────────────────────────────────────────

  const handleDiscard = () => {
    sandboxDocument.deserialize({ version: 1, nodes: [] });
    sandboxHistory.clear();
    setCurrentPrefabPath(null);
    setStatusText('Empty sandbox');
  };

  // ── Save / Commit ─────────────────────────────────────────────────────────

  /**
   * Build PrefabAsset from sandbox state using the synthetic-root strategy (b):
   * - If sandbox has exactly 1 root node → serialize it directly as the prefab root.
   * - If sandbox has 0 or >1 root nodes → create an in-memory synthetic root node
   *   (no mesh, name = prefab name) that parents all sandbox roots. The sandbox
   *   SceneDocument is NOT mutated; the synthetic node exists only for serialization.
   */
  const buildPrefabAsset = (prefabName: string) => {
    const allNodes = sandboxDocument.getAllNodes();
    const roots = sandboxDocument.getRoots();

    if (roots.length === 1) {
      // Single root — serialize subtree directly
      return serializeToPrefab(roots[0].id, allNodes, prefabName);
    }

    // Multi-root (or empty) — synthesize a root in-memory without mutating sandbox
    const syntheticId = generateUUID();
    const syntheticRoot: SceneNode = {
      id: syntheticId,
      name: prefabName || 'Root',
      parent: null,
      order: 0,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      components: {},
      userData: {},
    };

    // Reparent sandbox roots to synthetic root in an augmented node list
    const augmented: SceneNode[] = [
      syntheticRoot,
      ...allNodes.map(n =>
        n.parent === null ? { ...n, parent: syntheticId } : n,
      ),
    ];

    return serializeToPrefab(syntheticId, augmented, prefabName);
  };

  /**
   * Write the prefab asset to disk via editor.projectManager, update PrefabRegistry.
   * Returns the written path on success or null on failure.
   */
  const commitPrefab = async (prefabName: string, targetPath: string): Promise<string | null> => {
    const asset = buildPrefabAsset(prefabName);

    try {
      await editor.projectManager.writeFile(targetPath, JSON.stringify(asset));
      // Ensure URL is registered in PrefabRegistry so live-sync has the path→url mapping.
      // writeFile fires fileChanged → PrefabRegistry.attach() handler refetches.
      // But if this path was not previously cached (new file), we prime the registry here.
      const url = await editor.projectManager.urlFor(targetPath);
      if (!editor.prefabRegistry.has(url)) {
        editor.prefabRegistry.set(url, asset, targetPath);
      }
      await editor.projectManager.rescan();
      editor.events.emit('prefabStoreChanged');
      return targetPath;
    } catch (err) {
      console.warn('[Workshop] commitPrefab failed:', err);
      setStatusText(`Save failed: ${String(err)}`);
      return null;
    }
  };

  /** Entry point: Save button click */
  const handleSave = async () => {
    const path = currentPrefabPath();
    if (path) {
      // Already has a path → overwrite in-place
      const prefabName = path.split('/').pop()?.replace(/\.prefab$/, '') ?? 'prefab';
      setStatusText('Saving…');
      const written = await commitPrefab(prefabName, path);
      if (written) {
        setStatusText(`Saved → ${written}`);
      }
    } else {
      // Blank sandbox → prompt for filename
      setShowNamePrompt(true);
    }
  };

  const handleNameConfirm = async (name: string) => {
    setShowNamePrompt(false);
    const targetPath = prefabPathForName(name);

    // Check if file already exists → confirm overwrite
    const exists = editor.projectManager.getFiles().some(f => f.path === targetPath);
    if (exists) {
      if (!window.confirm(`"${targetPath}" already exists. Overwrite?`)) return;
    }

    setStatusText('Saving…');
    const written = await commitPrefab(name, targetPath);
    if (written) {
      setCurrentPrefabPath(written);
      setStatusText(`Saved → ${written}`);
    }
  };

  const handleNameCancel = () => {
    setShowNamePrompt(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div data-testid="workshop-panel" class={styles.panel}>
      <PanelHeader
        title="Workshop"
        actions={
          <>
            <button
              data-testid="workshop-save-btn"
              class={styles.saveBtn}
              onClick={handleSave}
              title="Save prefab to disk"
            >
              Save
            </button>
            <button
              class={styles.discardBtn}
              onClick={handleDiscard}
              title="Discard sandbox content"
            >
              Discard
            </button>
          </>
        }
      />

      <div class={styles.body}>
        {/* Left: asset browser */}
        <AssetBrowser
          projectFiles={bridge.projectFiles()}
          onOpenPrefab={handleOpenPrefab}
        />

        {/* Right: 3D viewport with drop target */}
        <div
          class={styles.viewport}
          classList={{ [styles.dragOver]: isDragOver() }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div ref={viewportRef} class={styles.canvas} />
          {isDragOver() && (
            <div class={styles.dropOverlay}>Drop .glb or scene node here</div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div class={styles.statusBar}>{statusText()}</div>

      {/* Name prompt for new prefab */}
      <PromptDialog
        open={showNamePrompt()}
        title="Save Prefab"
        message="Enter a name for this prefab file."
        placeholder="my-prefab"
        confirmLabel="Save"
        cancelLabel="Cancel"
        onConfirm={handleNameConfirm}
        onCancel={handleNameCancel}
      />
    </div>
  );
};

export default WorkshopPanel;
