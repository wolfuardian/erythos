import { onMount, onCleanup, createEffect, createSignal, Show, For, type Component } from 'solid-js';
import type { ShadingMode } from '../../viewport/ShadingManager';
import type { QualityLevel } from '../../viewport/PostProcessing';
import type { Object3D } from 'three';
import { Raycaster, Plane, Vector3, Vector2 } from 'three';
import { Viewport } from '../../viewport/Viewport';
import { useEditor } from '../../app/EditorContext';
import { SetTransformCommand } from '../../core/commands/SetTransformCommand';
import type { Vec3 } from '../../core/scene/SceneFormat';
import { loadGLTFFromFile, loadGLTFFromCache } from '../../utils/gltfLoader';
import { ErrorDialog } from '../../components/ErrorDialog';
import { InstantiateLeafCommand } from '../../core/commands/InstantiateLeafCommand';
import * as LeafStore from '../../core/scene/LeafStore';

const ViewportPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  let containerRef!: HTMLDivElement;
  let viewport: Viewport | null = null;

  const [isDragging, setIsDragging] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [renderMode, setRenderMode] = createSignal<ShadingMode>('solid');
  const [sceneLightsOn, setSceneLightsOn] = createSignal(true);
  const [quality, setQuality] = createSignal<QualityLevel>('normal');

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

      // 路徑 1：OS 檔案拖放（現有邏輯）
      const files = Array.from(e.dataTransfer?.files ?? []);
      const gltfFile = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
      if (gltfFile) {
        // 計算 NDC 座標（-1 到 1）
        const rect = containerRef.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Raycast 對 y=0 平面
        let dropPosition: Vec3 = [0, 0, 0];
        if (viewport) {
          const raycaster = new Raycaster();
          raycaster.setFromCamera(new Vector2(ndcX, ndcY), viewport.cameraCtrl.camera);
          const groundPlane = new Plane(new Vector3(0, 1, 0), 0); // normal=(0,1,0), constant=0 → y=0
          const hitPoint = new Vector3();
          const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
          if (hit) {
            dropPosition = [hitPoint.x, 0, hitPoint.z];
          }
        }

        try {
          const groupUUID = await loadGLTFFromFile(gltfFile, editor);

          // 只有 hit 到 y=0 平面時才設定位置（fallback 原點不需 command）
          if (dropPosition[0] !== 0 || dropPosition[2] !== 0) {
            const oldPos: Vec3 = [0, 0, 0]; // 新導入節點始終從原點開始
            editor.execute(new SetTransformCommand(editor, groupUUID, 'position', dropPosition, oldPos));
          }
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      // 路徑 2：內部 GLB 拖曳（從 Project 面板）
      const internalGlb = e.dataTransfer?.getData('application/erythos-glb');
      if (internalGlb) {
        // 同 OS drop：計算 NDC 座標 + raycast y=0 平面
        const rect = containerRef.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        let dropPosition: Vec3 = [0, 0, 0];
        if (viewport) {
          const raycaster = new Raycaster();
          raycaster.setFromCamera(new Vector2(ndcX, ndcY), viewport.cameraCtrl.camera);
          const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
          const hitPoint = new Vector3();
          const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
          if (hit) dropPosition = [hitPoint.x, 0, hitPoint.z];
        }

        try {
          const groupUUID = await loadGLTFFromCache(internalGlb, editor);
          if (groupUUID && (dropPosition[0] !== 0 || dropPosition[2] !== 0)) {
            const oldPos: Vec3 = [0, 0, 0];
            editor.execute(new SetTransformCommand(editor, groupUUID, 'position', dropPosition, oldPos));
          }
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      // 路徑 3：Leaf 拖曳（從 Leaf Panel）
      const leafId = e.dataTransfer?.getData('application/erythos-leaf');
      if (leafId) {
        // 計算 NDC 座標（與路徑 1、2 相同公式）
        const rect = containerRef.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        let dropPosition: Vec3 = [0, 0, 0];
        if (viewport) {
          const raycaster = new Raycaster();
          raycaster.setFromCamera(new Vector2(ndcX, ndcY), viewport.cameraCtrl.camera);
          const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
          const hitPoint = new Vector3();
          const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
          if (hit) dropPosition = [hitPoint.x, 0, hitPoint.z];
        }

        try {
          const asset = await LeafStore.get(leafId);
          if (asset) {
            editor.execute(new InstantiateLeafCommand(editor, asset, dropPosition));
          }
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
        return;
      }
    };

    let ctrlPressed = false;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'f' || e.key === 'F') {
        const uuids = bridge.selectedUUIDs();
        const primaryUUID = uuids.length > 0 ? uuids[uuids.length - 1] : null;
        if (primaryUUID && viewport) {
          const obj = editor.sceneSync.getObject3D(primaryUUID);
          if (obj) viewport.focusObject(obj);
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

      if (e.key === 'Control' && !ctrlPressed) {
        ctrlPressed = true;
        viewport?.gizmo.setVisible(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        ctrlPressed = false;
        viewport?.gizmo.setVisible(true);
      }
    };

    const onBlur = () => {
      if (ctrlPressed) {
        ctrlPressed = false;
        viewport?.gizmo.setVisible(true);
      }
    };

    containerRef.addEventListener('dragover', onDragOver);
    containerRef.addEventListener('dragenter', onDragEnter);
    containerRef.addEventListener('dragleave', onDragLeave);
    containerRef.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    onCleanup(() => {
      containerRef.removeEventListener('dragover', onDragOver);
      containerRef.removeEventListener('dragenter', onDragEnter);
      containerRef.removeEventListener('dragleave', onDragLeave);
      containerRef.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });

    viewport = new Viewport(editor.threeScene, {
      onSelect: (obj, modifier) => {
        if (modifier.ctrl && obj) {
          const uuid = editor.sceneSync.getUUID(obj);
          if (uuid) editor.selection.toggle(uuid);
        } else {
          const uuid = obj ? editor.sceneSync.getUUID(obj) : null;
          editor.selection.select(uuid);
        }
      },
      onHover: (obj, _modifier) => {
        editor.selection.hover(obj ? editor.sceneSync.getUUID(obj) : null);
      },
      isEntity: (obj) => editor.sceneSync.getUUID(obj) !== null,
      resolveTarget: (obj, modifier) => {
        // Ctrl: phase 1 already stopped at the nearest entity — return as-is.
        if (modifier.ctrl) return obj;
        // No Ctrl: walk up to the scene root child (original behaviour).
        let cur = obj;
        while (cur.parent && cur.parent !== editor.threeScene) {
          cur = cur.parent;
        }
        return cur;
      },
      onBoxSelect: (objects, modifier) => {
        if (!modifier.ctrl) {
          editor.selection.select(null);
        }
        for (const obj of objects) {
          const uuid = editor.sceneSync.getUUID(obj);
          if (uuid) editor.selection.add(uuid);
        }
      },
      onMultiTransformEnd: (objects, startTransforms) => {
        for (let i = 0; i < objects.length; i++) {
          const obj = objects[i];
          const start = startTransforms[i];
          const uuid = editor.sceneSync.getUUID(obj);
          if (!uuid) continue;
          if (!obj.position.equals(start.pos)) {
            const newPos: Vec3 = [obj.position.x, obj.position.y, obj.position.z];
            const oldPos: Vec3 = [start.pos.x, start.pos.y, start.pos.z];
            editor.execute(new SetTransformCommand(editor, uuid, 'position', newPos, oldPos));
          }
          if (!obj.rotation.equals(start.rot)) {
            const newRot: Vec3 = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
            const oldRot: Vec3 = [start.rot.x, start.rot.y, start.rot.z];
            editor.execute(new SetTransformCommand(editor, uuid, 'rotation', newRot, oldRot));
          }
          if (!obj.scale.equals(start.scale)) {
            const newScale: Vec3 = [obj.scale.x, obj.scale.y, obj.scale.z];
            const oldScale: Vec3 = [start.scale.x, start.scale.y, start.scale.z];
            editor.execute(new SetTransformCommand(editor, uuid, 'scale', newScale, oldScale));
          }
        }
      },
      onTransformEnd: (obj, startPos, startRot, startScale) => {
        const uuid = editor.sceneSync.getUUID(obj);
        if (!uuid) return;
        if (!obj.position.equals(startPos)) {
          const newPos: Vec3 = [obj.position.x, obj.position.y, obj.position.z];
          const oldPos: Vec3 = [startPos.x, startPos.y, startPos.z];
          editor.execute(new SetTransformCommand(editor, uuid, 'position', newPos, oldPos));
        }
        if (!obj.rotation.equals(startRot)) {
          const newRot: Vec3 = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
          const oldRot: Vec3 = [startRot.x, startRot.y, startRot.z];
          editor.execute(new SetTransformCommand(editor, uuid, 'rotation', newRot, oldRot));
        }
        if (!obj.scale.equals(startScale)) {
          const newScale: Vec3 = [obj.scale.x, obj.scale.y, obj.scale.z];
          const oldScale: Vec3 = [startScale.x, startScale.y, startScale.z];
          editor.execute(new SetTransformCommand(editor, uuid, 'scale', newScale, oldScale));
        }
      },
    });

    viewport.mount(containerRef);
  });

  // Sync selection → viewport (UUID → Object3D)
  createEffect(() => {
    const objects = bridge.selectedUUIDs()
      .map(uuid => editor.sceneSync.getObject3D(uuid))
      .filter((o): o is Object3D => o !== null);
    viewport?.setSelectedObjects(objects);
  });

  createEffect(() => {
    const uuid = bridge.hoveredUUID();
    const obj = uuid ? editor.sceneSync.getObject3D(uuid) : null;
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

  // autosave restore 或場景替換後重新套用 shading mode（讓材質覆蓋/頭燈正確初始化）
  createEffect(() => {
    bridge.sceneVersion();
    viewport?.shading.forceApply();
    viewport?.requestRender();
  });

  createEffect(() => {
    viewport?.setShadingMode(renderMode());
    viewport?.requestRender();
  });

  createEffect(() => {
    viewport?.shading.setSceneLightsEnabled(sceneLightsOn());
    viewport?.requestRender();
  });

  createEffect(() => {
    viewport?.setQuality(quality());
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
      {/* 渲染模式工具列 */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        display: 'flex',
        'align-items': 'center',
        gap: '2px',
        background: 'rgba(20,20,20,0.75)',
        'border-radius': '5px',
        padding: '3px',
        'z-index': '5',
        'user-select': 'none',
      }}>
        <For each={(['wireframe', 'solid', 'shading', 'rendering'] as ShadingMode[])}>
          {(mode) => (
            <button
              onClick={() => setRenderMode(mode)}
              style={{
                background: renderMode() === mode ? 'rgba(255,255,255,0.18)' : 'transparent',
                border: 'none',
                color: renderMode() === mode ? 'var(--text-primary, #fff)' : 'var(--text-secondary, #aaa)',
                padding: '3px 8px',
                cursor: 'pointer',
                'border-radius': '3px',
                'font-size': '11px',
                'font-weight': renderMode() === mode ? '600' : '400',
                transition: 'background 0.1s',
              }}
            >
              {mode === 'wireframe' ? 'Wire' :
               mode === 'solid' ? 'Solid' :
               mode === 'shading' ? 'Shading' : 'Render'}
            </button>
          )}
        </For>

        <Show when={renderMode() === 'shading'}>
          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
          <button
            onClick={() => setSceneLightsOn(v => !v)}
            style={{
              background: sceneLightsOn() ? 'rgba(255,200,50,0.2)' : 'transparent',
              border: 'none',
              color: sceneLightsOn() ? 'rgba(255,200,100,1)' : 'var(--text-secondary, #aaa)',
              padding: '3px 8px',
              cursor: 'pointer',
              'border-radius': '3px',
              'font-size': '11px',
              transition: 'background 0.1s',
            }}
          >
            Lights
          </button>
        </Show>

        {/* 品質切換 */}
        <Show when={renderMode() === 'rendering'}>
          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
          <For each={(['low', 'normal', 'high'] as QualityLevel[])}>
            {(q) => (
              <button
                onClick={() => setQuality(q)}
                style={{
                  background: quality() === q ? 'rgba(255,255,255,0.18)' : 'transparent',
                  border: 'none',
                  color: quality() === q ? 'var(--text-primary, #fff)' : 'var(--text-secondary, #aaa)',
                  padding: '3px 6px',
                  cursor: 'pointer',
                  'border-radius': '3px',
                  'font-size': '10px',
                  'font-weight': quality() === q ? '600' : '400',
                  transition: 'background 0.1s',
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.5px',
                }}
              >
                {q === 'low' ? 'L' : q === 'normal' ? 'N' : 'H'}
              </button>
            )}
          </For>
        </Show>
      </div>
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
