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
import { SceneDocument } from '../../core/scene/SceneDocument';
import { History } from '../../core/History';
import { EventEmitter } from '../../core/EventEmitter';
import { SceneSync } from '../../core/scene/SceneSync';
import { deserializeFromPrefab } from '../../core/scene/PrefabSerializer';
import type { ProjectFile } from '../../core/project/ProjectFile';
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

  // ── GLB drop handler ─────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('application/erythos-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

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
      ? `Editing: ${currentPrefabPath()} (read-only — Save in P3)`
      : 'Empty sandbox');
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
    setStatusText(`Editing: ${file.path} (read-only — Save in P3)`);
  };

  // ── Discard ──────────────────────────────────────────────────────────────

  const handleDiscard = () => {
    sandboxDocument.deserialize({ version: 1, nodes: [] });
    sandboxHistory.clear();
    setCurrentPrefabPath(null);
    setStatusText('Empty sandbox');
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div data-testid="workshop-panel" class={styles.panel}>
      <PanelHeader
        title="Workshop"
        actions={
          <button
            class={styles.discardBtn}
            onClick={handleDiscard}
            title="Discard sandbox content"
          >
            Discard
          </button>
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
            <div class={styles.dropOverlay}>Drop .glb here</div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div class={styles.statusBar}>{statusText()}</div>
    </div>
  );
};

export default WorkshopPanel;
