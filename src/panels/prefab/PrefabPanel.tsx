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
import * as GlbStore from '../../core/scene/GlbStore';
import { PanelHeader } from '../../components/PanelHeader';
import { useThumbnails } from './useThumbnails';
import styles from './PrefabPanel.module.css';

const PrefabPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [activeId, setActiveId] = useAreaState<string | null>('activeId', null);
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

  // 載入 leaf 內容到預覽場景
  const loadLeafPreview = async (assetId: string) => {
    const asset = bridge.prefabAssets().find(a => a.id === assetId);
    if (!asset || !previewScene) return;

    clearContent();

    // 收集 leaf 中所有唯一的 GLB 來源（source 是 "file.glb:path" 格式，取 ":" 前的部分）
    const sources = [...new Set(
      asset.nodes
        .filter(n => (n.components as Record<string, unknown>)?.mesh)
        .map(n => ((n.components as Record<string, { source: string }>).mesh.source).split(':')[0])
    )];

    for (const source of sources) {
      // 確保已在 ResourceCache 中
      if (!editor.resourceCache.has(source)) {
        const buffer = await GlbStore.get(source);
        if (!buffer) continue;
        try {
          await editor.resourceCache.loadFromBuffer(source, buffer);
        } catch {
          continue;
        }
      }

      // 從快取 clone（不影響主場景）
      const obj = editor.resourceCache.cloneSubtree(source);
      if (!obj) continue;
      contentObjects.push(obj);
      previewScene.add(obj);
    }

    autoFrame();
  };

  // 選取 leaf 時載入預覽
  createEffect(() => {
    const id = activeId();
    if (!id) {
      clearContent();
      return;
    }
    void loadLeafPreview(id);
  });

  return (
    <div data-testid="prefab-panel" class={styles.panel}>
      {/* Header */}
      <PanelHeader title={`Prefabs (${bridge.prefabAssets().length})`} />

      {/* Body: list + preview */}
      <div class={styles.body}>
        {/* Left: leaf list */}
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
                const isActive = () => activeId() === asset.id;
                return (
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer!.setData('application/erythos-prefab', asset.id);
                      e.dataTransfer!.effectAllowed = 'copy';
                    }}
                    onClick={() => setActiveId(isActive() ? null : asset.id)}
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
          <Show when={!activeId()}>
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
