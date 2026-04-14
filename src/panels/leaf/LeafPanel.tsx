import {
  createSignal, For, Show, onMount, onCleanup, createEffect,
  type Component,
} from 'solid-js';
import {
  Scene, WebGLRenderer, PerspectiveCamera,
  DirectionalLight, AmbientLight, Box3, Vector3,
  ACESFilmicToneMapping, type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEditor } from '../../app/EditorContext';
import * as GlbStore from '../../core/scene/GlbStore';

const LeafPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  const [activeId, setActiveId] = createSignal<string | null>(null);

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
    renderer.setClearColor(0x1a1a1a);
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
    const asset = bridge.leafAssets().find(a => a.id === assetId);
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
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 10px',
        'border-bottom': '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
        'font-size': 'var(--font-size-xs)',
        'text-transform': 'uppercase',
        'letter-spacing': '0.5px',
        'flex-shrink': 0,
      }}>
        Leaves ({bridge.leafAssets().length})
      </div>

      {/* Body: list + preview */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: leaf list */}
        <div style={{
          width: '160px',
          'flex-shrink': 0,
          'border-right': '1px solid var(--border-subtle)',
          overflow: 'auto',
          padding: '4px 0',
        }}>
          <Show
            when={bridge.leafAssets().length > 0}
            fallback={
              <div style={{
                padding: '12px 10px',
                color: 'var(--text-muted)',
                'font-size': 'var(--font-size-xs)',
                'text-align': 'center',
                'line-height': '1.6',
              }}>
                No leaves saved.<br />
                Right-click a node<br />
                in Scene tree.
              </div>
            }
          >
            <For each={bridge.leafAssets()}>
              {(asset) => {
                const isActive = () => activeId() === asset.id;
                return (
                  <div
                    onClick={() => setActiveId(isActive() ? null : asset.id)}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '6px',
                      padding: '5px 8px',
                      cursor: 'pointer',
                      background: isActive()
                        ? 'var(--bg-selected, rgba(74,127,191,0.2))'
                        : 'transparent',
                      'border-left': isActive()
                        ? '2px solid var(--accent-primary, #4a7fbf)'
                        : '2px solid transparent',
                    }}
                  >
                    <span style={{
                      width: '14px',
                      height: '14px',
                      'border-radius': 'var(--radius-sm)',
                      background: 'var(--badge-mesh, #4a6f5f)',
                      color: 'var(--text-inverse)',
                      'font-size': '8px',
                      'font-weight': 'bold',
                      display: 'flex',
                      'align-items': 'center',
                      'justify-content': 'center',
                      'flex-shrink': 0,
                    }}>L</span>
                    <span style={{
                      'font-size': 'var(--font-size-xs)',
                      color: isActive() ? 'var(--text-primary)' : 'var(--text-secondary)',
                      overflow: 'hidden',
                      'text-overflow': 'ellipsis',
                      'white-space': 'nowrap',
                      flex: 1,
                    }}>
                      {asset.name}
                    </span>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>

        {/* Right: 3D preview (always mounted so renderer stays alive) */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Renderer canvas target */}
          <div ref={previewRef} style={{ width: '100%', height: '100%' }} />

          {/* Overlay when nothing selected */}
          <Show when={!activeId()}>
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              background: 'var(--bg-panel, #1a1a1a)',
              color: 'var(--text-muted)',
              'font-size': 'var(--font-size-xs)',
              'text-align': 'center',
              'pointer-events': 'none',
            }}>
              Select a leaf<br />to preview
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default LeafPanel;
