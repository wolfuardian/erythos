import {
  For, Show, onMount, onCleanup, createEffect,
  type Component,
} from 'solid-js';
import {
  Scene, WebGLRenderer, PerspectiveCamera,
  DirectionalLight, AmbientLight, Box3, Vector3,
  ACESFilmicToneMapping, type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEditor } from '../../app/EditorContext';
import { useAreaState } from '../../app/areaState';
import { PanelHeader } from '../../components/PanelHeader';
import { useThumbnails } from './useThumbnails';
import { prefabPathForName } from '../../utils/prefabPath';
import styles from './PrefabPanel.module.css';

const PrefabPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  // activeId now stores the prefab path (project-relative), not the asset id
  const [activePath, setActivePath] = useAreaState<string | null>('activePath', null);
  const { getThumbnail } = useThumbnails(() => bridge.prefabAssets(), editor);

  let previewRef!: HTMLDivElement;
  let renderer: WebGLRenderer | null = null;
  let previewScene: Scene | null = null;
  let camera: PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let animFrameId = 0;
  let resizeObserver: ResizeObserver | null = null;
  const contentObjects: Object3D[] = [];

  onMount(() => {
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x3f3f3f);
    previewRef.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    previewScene = new Scene();
    const ambient = new AmbientLight(0xffffff, 0.4);
    const dirLight = new DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 4, 3);
    previewScene.add(ambient, dirLight);

    camera = new PerspectiveCamera(45, 1, 0.001, 1000);
    camera.position.set(0, 1, 3);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    const updateSize = () => {
      if (!renderer || !camera) return;
      const w = previewRef.clientWidth;
      const h = previewRef.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(previewRef);
    updateSize();

    const loop = () => {
      animFrameId = requestAnimationFrame(loop);
      controls?.update();
      if (renderer && previewScene && camera) {
        renderer.render(previewScene, camera);
      }
    };
    loop();
  });

  onCleanup(() => {
    cancelAnimationFrame(animFrameId);
    resizeObserver?.disconnect();
    controls?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
  });

  // 清除預覽場景的內容物件
  const clearContent = () => {
    if (!previewScene) return;
    contentObjects.forEach(obj => previewScene!.remove(obj));
    contentObjects.length = 0;
  };

  // 自動對焦相機以包含所有內容
  const autoFrame = () => {
    if (!camera || !controls || !previewScene || contentObjects.length === 0) return;
    const box = new Box3();
    contentObjects.forEach(obj => box.expandByObject(obj));
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3()).length();
    controls.target.copy(center);
    camera.position.copy(center).add(new Vector3(0, size * 0.3, size * 1.2));
    camera.near = size * 0.001;
    camera.far = size * 100;
    camera.updateProjectionMatrix();
    controls.update();
  };

  /**
   * Load a prefab's GLB meshes into the preview scene.
   * Uses PrefabRegistry to get the asset, then ResourceCache for the GLB.
   * Mesh URLs in prefab nodes come from the node's mesh.url (populated at scene load).
   * Falls back gracefully if any source is missing.
   */
  const loadPrefabPreview = async (path: string) => {
    // Find the asset by path via PrefabRegistry
    const url = editor.prefabRegistry.getURLForPath(path);
    if (!url) return;
    const asset = editor.prefabRegistry.get(url);
    if (!asset || !previewScene) return;

    clearContent();

    // Collect unique mesh URLs from prefab nodes
    // Prefab nodes store mesh.url (populated when the prefab was instantiated from a scene
    // that had hydrated mesh.url values). Fall back to mesh.path → urlFor if url is absent.
    const meshURLs = new Set<string>();
    for (const prefabNode of asset.nodes) {
      const mesh = (prefabNode.components as Record<string, unknown>)?.['mesh'] as
        | { url?: string; path?: string }
        | undefined;
      if (!mesh) continue;
      if (mesh.url) {
        meshURLs.add(mesh.url);
      } else if (mesh.path) {
        try {
          const meshURL = await editor.projectManager.urlFor(mesh.path);
          meshURLs.add(meshURL);
        } catch {
          // soft-fail — skip this mesh
        }
      }
    }

    for (const meshURL of meshURLs) {
      // Ensure loaded in ResourceCache
      if (!editor.resourceCache.has(meshURL)) {
        try {
          await editor.resourceCache.loadFromURL(meshURL);
        } catch {
          continue;
        }
      }

      // Clone from cache (does not affect main scene)
      const obj = editor.resourceCache.cloneSubtree(meshURL);
      if (!obj) continue;
      contentObjects.push(obj);
      previewScene.add(obj);
    }

    autoFrame();
  };

  // 選取 prefab 時載入預覽
  createEffect(() => {
    const path = activePath();
    if (!path) {
      clearContent();
      return;
    }
    void loadPrefabPreview(path);
  });

  return (
    <div data-testid="prefab-panel" class={styles.panel}>
      {/* Header */}
      <PanelHeader title={`Prefabs (${bridge.prefabAssets().length})`} />

      {/* Body: list + preview */}
      <div class={styles.body}>
        {/* Left: prefab list */}
        <div class={styles.list}>
          <Show
            when={bridge.prefabAssets().length > 0}
            fallback={
              <div class={styles.emptyHint}>
                No prefabs saved.<br />
                Right-click a node<br />
                in Scene tree.
              </div>
            }
          >
            <For each={bridge.prefabAssets()}>
              {(asset) => {
                const path = prefabPathForName(asset.name);
                const isActive = () => activePath() === path;
                return (
                  <div
                    draggable
                    onDragStart={(e) => {
                      // Payload is path (project-relative), not asset.id
                      e.dataTransfer!.setData('application/erythos-prefab', path);
                      e.dataTransfer!.effectAllowed = 'copy';
                    }}
                    onClick={() => setActivePath(isActive() ? null : path)}
                    class={styles.listItem}
                    classList={{ [styles.active]: isActive() }}
                  >
                    <Show
                      when={getThumbnail(asset.id)}
                      fallback={
                        <span class={styles.fallbackThumb}>L</span>
                      }
                    >
                      {(dataURL) => (
                        <img
                          src={dataURL()}
                          width={32}
                          height={32}
                          class={styles.thumbnail}
                          alt={asset.name}
                        />
                      )}
                    </Show>
                    <span class={styles.itemName}>
                      {asset.name}
                    </span>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>

        {/* Right: 3D preview (always mounted so renderer stays alive) */}
        <div class={styles.preview}>
          {/* Renderer canvas target */}
          <div ref={previewRef} class={styles.previewCanvas} />

          {/* Overlay when nothing selected */}
          <Show when={!activePath()}>
            <div class={styles.previewOverlay}>
              Select a prefab<br />to preview
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default PrefabPanel;
