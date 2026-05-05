import { onMount, onCleanup, createEffect, createSignal, Show, type Component } from 'solid-js';
import styles from './ViewportPanel.module.css';
import type { ShadingMode } from '../../viewport/ShadingManager';
import type { QualityLevel } from '../../viewport/PostProcessing';
import type { Object3D, Vector3, Euler } from 'three';

import { Viewport } from '../../viewport/Viewport';
import { useEditor } from '../../app/EditorContext';
import type { Editor } from '../../core/Editor';
import { SetTransformCommand } from '../../core/commands/SetTransformCommand';
import type { Vec3 } from '../../core/scene/SceneFormat';
import { asAssetPath } from '../../utils/branded';
import { loadGLTFFromFile } from '../../utils/gltfLoader';
import { loadHDRI } from '../../utils/hdriLoader';
import { ErrorDialog } from '../../components/ErrorDialog';
import { InstantiatePrefabCommand } from '../../core/commands/InstantiatePrefabCommand';
import { computeDropPosition } from '../../viewport/dropPosition';
import { DEFAULT_RENDER_SETTINGS, type RenderSettings } from '../../viewport/RenderSettings';
import { PanelHeader } from '../../components/PanelHeader';
import { SceneOpsToolbar } from '../../components/SceneOpsToolbar';
import { useArea } from '../../app/AreaContext';
import { getPanelState, setPanelState } from '../../app/viewportState';
import { currentWorkspace } from '../../app/workspaceStore';
import { ShadingToolbar } from './ShadingToolbar';
import { RenderSettingsPanel } from './RenderSettingsPanel';

async function importGlbAndApplyDropPosition(
  file: File,
  dropPosition: Vec3,
  editor: Editor,
): Promise<void> {
  const groupUUID = await loadGLTFFromFile(file, editor);
  if (dropPosition[0] !== 0 || dropPosition[2] !== 0) {
    editor.execute(new SetTransformCommand(editor, groupUUID, 'position', dropPosition, [0, 0, 0]));
  }
}

function defaultSceneLightsFor(mode: ShadingMode): boolean {
  return mode === 'solid' || mode === 'rendering';
}

function emitTransformCommands(
  obj: Object3D,
  start: { pos: Vector3; rot: Euler; scale: Vector3 },
  editor: Editor,
): void {
  const uuid = editor.sceneSync.getUUID(obj);
  if (!uuid) return;
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

const ViewportPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;
  const area = useArea();
  let containerRef!: HTMLDivElement;
  let canvasRef!: HTMLDivElement;
  let viewport: Viewport | null = null;

  const [isDragging, setIsDragging] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [renderMode, setRenderMode] = createSignal<ShadingMode>('solid');
  const [quality, setQuality] = createSignal<QualityLevel>('normal');
  const [renderSettings, setRenderSettings] = createSignal<RenderSettings>(DEFAULT_RENDER_SETTINGS);
  const [shadingExpanded, setShadingExpanded] = createSignal(true);
  const [hdrIntensity, setHdrIntensity] = createSignal(1.0);
  const [hdrRotation, setHdrRotation] = createSignal(0);
  const [lookdevPreset, setLookdevPreset] = createSignal<import('../../viewport/ShadingManager').LookdevPreset>('room');
  const [panelExpanded, setPanelExpanded] = createSignal(true);
  const [groupCollapsed, setGroupCollapsed] = createSignal<Record<string, boolean>>({});
  const isGroupOpen = (key: string) => !groupCollapsed()[key];
  const toggleGroup = (key: string) => setGroupCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Per-mode scene lights override map
  // key = ShadingMode，value = override（undefined 代表使用 mode default）
  const [sceneLightsOverrides, setSceneLightsOverrides] = createSignal<Partial<Record<ShadingMode, boolean>>>({});

  const sceneLightsOn = (): boolean =>
    sceneLightsOverrides()[renderMode()] ?? defaultSceneLightsFor(renderMode());

  const updateSetting = <K extends keyof RenderSettings>(
    key: K,
    patch: Partial<RenderSettings[K]>,
  ): void => {
    setRenderSettings(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  onMount(() => {
    const onPointerDown = () => {
      if (area?.id) bridge.setActiveViewportId(area.id);
    };
    const onPointerEnter = () => {
      if (area?.id) bridge.setActiveViewportId(area.id);
    };

    containerRef.addEventListener('pointerdown', onPointerDown);
    containerRef.addEventListener('pointerenter', onPointerEnter);

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

      // 路徑 1：OS 檔案拖放
      const files = Array.from(e.dataTransfer?.files ?? []);
      const gltfFile = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
      if (gltfFile) {
        const dropPosition = computeDropPosition(e, canvasRef, viewport);
        try {
          await importGlbAndApplyDropPosition(gltfFile, dropPosition, editor);
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      // 路徑 2a：內部 GLB multi-list 拖曳（從 Project 面板 multi-select）
      const internalGlbList = e.dataTransfer?.getData('application/erythos-glb-list');
      if (internalGlbList) {
        // Mint at the drag-transfer boundary: JSON.parse returns string[]
        const paths = (JSON.parse(internalGlbList) as string[]).map(asAssetPath);
        const dropPosition = computeDropPosition(e, canvasRef, viewport);
        const errors: string[] = [];
        for (const p of paths) {
          try {
            const file = await editor.projectManager.readFile(p);
            await importGlbAndApplyDropPosition(file, dropPosition, editor);
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
          }
        }
        if (errors.length > 0) setErrorMessage(errors.join('\n'));
        return;
      }

      // 路徑 2b：內部 GLB 拖曳（從 Project 面板）
      const internalGlbRaw = e.dataTransfer?.getData('application/erythos-glb');
      if (internalGlbRaw) {
        // Mint at the drag-transfer boundary: getData returns plain string
        const internalGlb = asAssetPath(internalGlbRaw);
        const dropPosition = computeDropPosition(e, canvasRef, viewport);
        try {
          const file = await editor.projectManager.readFile(internalGlb);
          await importGlbAndApplyDropPosition(file, dropPosition, editor);
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      // 路徑 3：Prefab 拖曳（從 Prefab Panel）
      // Payload is the project-relative path (e.g. "prefabs/chair.prefab")
      const prefabPathRaw = e.dataTransfer?.getData('application/erythos-prefab');
      if (prefabPathRaw) {
        // Mint at the drag-transfer boundary: getData returns plain string
        const prefabPath = asAssetPath(prefabPathRaw);
        const dropPosition = computeDropPosition(e, canvasRef, viewport);

        try {
          // Look up URL from PrefabRegistry via path, then get the parsed asset
          const url = editor.prefabRegistry.getURLForPath(prefabPath);
          if (url) {
            const asset = editor.prefabRegistry.get(url);
            if (asset) {
              editor.execute(new InstantiatePrefabCommand(editor, asset, prefabPath, dropPosition));
            }
          } else {
            // URL not cached yet — load via urlFor + registry
            const resolvedURL = await editor.projectManager.urlFor(prefabPath);
            const asset = await editor.prefabRegistry.loadFromURL(resolvedURL, prefabPath);
            editor.execute(new InstantiatePrefabCommand(editor, asset, prefabPath, dropPosition));
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
        if (!area?.id || bridge.activeViewportId() === area.id) {
          const uuids = bridge.selectedUUIDs();
          const primaryUUID = uuids.length > 0 ? uuids[uuids.length - 1] : null;
          if (primaryUUID && viewport) {
            const obj = editor.sceneSync.getObject3D(primaryUUID);
            if (obj) viewport.focusObject(obj);
          }
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
      containerRef.removeEventListener('pointerdown', onPointerDown);
      containerRef.removeEventListener('pointerenter', onPointerEnter);
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
          emitTransformCommands(objects[i], startTransforms[i], editor);
        }
      },
      onTransformEnd: (obj, startPos, startRot, startScale) => {
        emitTransformCommands(obj, { pos: startPos, rot: startRot, scale: startScale }, editor);
      },
    });

    viewport.mount(canvasRef, bridge.sharedGridObjects);

    // 拖曳開始/結束 → 更新 bridge 全局 draggingViewportId（讓所有 viewport 知道誰在拖）
    const onGizmoDraggingChanged = (event: { value: unknown }) => {
      const dragging = event.value as boolean;
      if (dragging && area?.id) {
        bridge.setActiveViewportId(area.id);
        bridge.setDraggingViewportId(area.id);
      } else {
        bridge.setDraggingViewportId(null);
      }
    };
    viewport.gizmo.controls.addEventListener('dragging-changed', onGizmoDraggingChanged);
    onCleanup(() => {
      viewport?.gizmo.controls.removeEventListener('dragging-changed', onGizmoDraggingChanged);
    });

    // 拖曳過程每幀 bumpDragTick → 非 active viewport 訂 dragTickVersion 後可即時 requestRender
    const onGizmoChange = () => {
      if (bridge.draggingViewportId() !== null) {
        bridge.bumpDragTick();
      }
    };
    viewport.gizmo.controls.addEventListener('change', onGizmoChange);
    onCleanup(() => {
      viewport?.gizmo.controls.removeEventListener('change', onGizmoChange);
    });

    // 訂 draggingViewportId：拖曳中隱藏非拖曳 viewport 的 gizmo helper
    createEffect(() => {
      const draggingId = bridge.draggingViewportId();
      if (!viewport) return;
      if (draggingId !== null) {
        viewport.gizmo.setVisibleForce(draggingId === area?.id);
      } else {
        viewport.gizmo.setVisibleForce(true);
      }
    });

    // 訂 dragTickVersion：拖曳過程讓非 active viewport 即時更新物件 transform 顯示
    createEffect(() => {
      bridge.dragTickVersion();
      viewport?.requestRender();
    });

    // Restore panel state after mount (controls rebuilt by mount, so restore AFTER)
    // capture workspaceId 到 closure，避免 workspace 切走後 onCleanup 寫到錯的 workspace
    const areaId = area?.id;
    const workspaceId = currentWorkspace().id;
    if (areaId) {
      const panelState = getPanelState(workspaceId, areaId);
      if (panelState?.camera) {
        viewport.cameraCtrl.camera.position.fromArray(panelState.camera.position);
        viewport.cameraCtrl.controls.target.fromArray(panelState.camera.target);
        viewport.cameraCtrl.controls.update();
      }
      if (panelState?.sceneLightsOverrides) {
        // shading effect 會接手 viewport.shading 副作用
        setSceneLightsOverrides(panelState.sceneLightsOverrides);
      }
      if (panelState?.lookdevPreset !== undefined) {
        setLookdevPreset(panelState.lookdevPreset);
      }
      if (panelState?.hdrIntensity !== undefined) {
        setHdrIntensity(panelState.hdrIntensity);
      }
      if (panelState?.hdrRotation !== undefined) {
        setHdrRotation(panelState.hdrRotation);
      }
    }

    // 離開（panel 卸載）時儲存完整 panel state；用 closure 的 workspaceId/areaId
    // 不得即時呼叫 currentWorkspace()，否則 workspace 切走時會寫到錯的 workspace
    onCleanup(() => {
      if (!viewport || !areaId) return;
      const cam = viewport.cameraCtrl;
      setPanelState(workspaceId, areaId, {
        camera: {
          position: cam.camera.position.toArray() as [number, number, number],
          target:   cam.controls.target.toArray()  as [number, number, number],
        },
        sceneLightsOverrides: sceneLightsOverrides(),
        lookdevPreset: lookdevPreset(),
        hdrIntensity: hdrIntensity(),
        hdrRotation: hdrRotation(),
      });
    });
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
    const mode = renderMode();
    viewport?.setShadingMode(mode);
    const override = sceneLightsOverrides()[mode];
    if (override !== undefined) {
      viewport?.shading.setSceneLightsEnabled(override);
    } else {
      // 沒 override → mode default 生效（applyMode 已更新 layers）
      viewport?.shading.clearSceneLightsOverride();
    }
    viewport?.requestRender();
  });

  createEffect(() => {
    if (renderMode() !== 'shading') return;
    viewport?.setLookdevPreset(lookdevPreset());
  });

  createEffect(() => {
    if (renderMode() !== 'shading') return;
    viewport?.setEnvironmentIntensity(hdrIntensity());
    viewport?.requestRender();
  });

  createEffect(() => {
    if (renderMode() !== 'shading') return;
    viewport?.setEnvironmentRotation(hdrRotation() * Math.PI / 180); // deg → rad
    viewport?.requestRender();
  });

  createEffect(() => {
    viewport?.setQuality(quality());
  });

  // Rendering 模式時套用效果設定；離開時關閉所有效果
  createEffect(() => {
    bridge.sceneVersion(); // 場景替換後也重新套用
    const mode = renderMode();
    const s = renderSettings();
    if (mode === 'rendering') {
      viewport?.setRenderSettings(s);
    } else {
      viewport?.setRenderSettings({
        toneMapping:  { ...s.toneMapping,  enabled: false },
        bloom:        { ...s.bloom,        enabled: false },
        ao:           { ...s.ao,           enabled: false },
        dof:          { ...s.dof,          enabled: false },
        motionBlur:   { ...s.motionBlur,   enabled: false },
      });
    }
  });

  // 監聽 Environment 面板設定 → 載入 HDRI + 套用參數
  createEffect(() => {
    const env = bridge.environmentSettings();
    if (!viewport) return;

    // Intensity + Rotation（每次都套用，不管 hdrUrl 有沒有變）
    viewport.setEnvironmentIntensity(env.intensity);
    viewport.setEnvironmentRotation(env.rotation * Math.PI / 180);
  });

  // hdrUrl 變更時載入/清除 HDRI（獨立 effect 避免每次 intensity 變更都重新載入 HDR）
  let lastHdrUrl: string | null = null;
  createEffect(() => {
    const env = bridge.environmentSettings();
    const url = env.hdrUrl;
    if (url === lastHdrUrl) return; // 沒變就不重新載入
    lastHdrUrl = url;

    if (!viewport) return;

    if (!url) {
      viewport.setCustomHDRI(null);
      return;
    }

    void loadHDRI(url)
      .then(texture => {
        viewport?.setCustomHDRI(texture);
      })
      .catch(err => {
        console.warn('[ViewportPanel] Failed to load HDRI:', err);
        viewport?.setCustomHDRI(null);
      });
  });

  onCleanup(() => {
    viewport?.dispose();
    viewport = null;
  });


  return (
    <div
      data-testid="viewport-panel"
      ref={containerRef}
      class={styles.container}
    >
      <PanelHeader title="Viewport" actions={
        <ShadingToolbar
          renderMode={renderMode}
          setRenderMode={setRenderMode}
        />
      } />
      <div
        ref={canvasRef}
        class={styles.canvas}
      >
      {/* SceneOps vertical overlay — Phase 3 of #688 */}
      <div
        data-testid="viewport-scene-ops-overlay"
        class={styles.sceneOpsOverlay}
      >
        <SceneOpsToolbar orientation="vertical" />
      </div>
      <Show when={isDragging()}>
        <div class={styles.dropOverlay}>
          放開以導入模型
        </div>
      </Show>
      {/* Rendering + Shading 懸浮面板 */}
      <RenderSettingsPanel
        panelExpanded={panelExpanded}
        setPanelExpanded={setPanelExpanded}
        renderSettings={renderSettings}
        updateSetting={updateSetting}
        quality={quality}
        setQuality={setQuality}
        isGroupOpen={isGroupOpen}
        toggleGroup={toggleGroup}
        renderMode={renderMode}
        shadingExpanded={shadingExpanded}
        setShadingExpanded={setShadingExpanded}
        sceneLightsOn={sceneLightsOn}
        onSceneLightsChange={(checked) => {
          // 寫 override → shading effect 接手 viewport.shading + render
          setSceneLightsOverrides(prev => ({ ...prev, [renderMode()]: checked }));
        }}
        hdrIntensity={hdrIntensity}
        setHdrIntensity={setHdrIntensity}
        hdrRotation={hdrRotation}
        setHdrRotation={setHdrRotation}
        lookdevPreset={lookdevPreset}
        setLookdevPreset={setLookdevPreset}
      />
      <ErrorDialog
        open={errorMessage() !== null}
        title="導入失敗"
        message={errorMessage() ?? ''}
        onClose={() => setErrorMessage(null)}
      />
      </div>
    </div>
  );
};

export default ViewportPanel;
