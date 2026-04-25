import { onMount, onCleanup, createEffect, createSignal, Show, For, type Component } from 'solid-js';
import type { ShadingMode } from '../../viewport/ShadingManager';
import type { QualityLevel } from '../../viewport/PostProcessing';
import type { Object3D } from 'three';

import { Viewport } from '../../viewport/Viewport';
import { useEditor } from '../../app/EditorContext';
import { SetTransformCommand } from '../../core/commands/SetTransformCommand';
import type { Vec3 } from '../../core/scene/SceneFormat';
import { loadGLTFFromFile } from '../../utils/gltfLoader';
import { loadHDRI } from '../../utils/hdriLoader';
import { ErrorDialog } from '../../components/ErrorDialog';
import { InstantiateLeafCommand } from '../../core/commands/InstantiateLeafCommand';
import * as LeafStore from '../../core/scene/LeafStore';
import { computeDropPosition } from '../../viewport/dropPosition';
import { DEFAULT_RENDER_SETTINGS, type RenderSettings } from '../../viewport/RenderSettings';
import { PanelHeader } from '../../components/PanelHeader';
import { NumberDrag } from '../../components/NumberDrag';
import { useArea } from '../../app/AreaContext';
import { getSnapshot, setSnapshot } from '../../app/viewportState';

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
  const [sceneLightsOn, setSceneLightsOn] = createSignal(true);
  const [quality, setQuality] = createSignal<QualityLevel>('normal');
  const [renderSettings, setRenderSettings] = createSignal<RenderSettings>(DEFAULT_RENDER_SETTINGS);
  const [shadingExpanded, setShadingExpanded] = createSignal(true);
  const [hdrIntensity, setHdrIntensity] = createSignal(1.0);
  const [hdrRotation, setHdrRotation] = createSignal(0);
  const [panelExpanded, setPanelExpanded] = createSignal(true);
  const [groupCollapsed, setGroupCollapsed] = createSignal<Record<string, boolean>>({});
  const isGroupOpen = (key: string) => !groupCollapsed()[key];
  const toggleGroup = (key: string) => setGroupCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const [hoveredShading, setHoveredShading] = createSignal<ShadingMode | null>(null);

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

      // 路徑 1：OS 檔案拖放（現有邏輯）
      const files = Array.from(e.dataTransfer?.files ?? []);
      const gltfFile = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
      if (gltfFile) {
        const dropPosition = computeDropPosition(e, canvasRef, viewport);

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
        const dropPosition = computeDropPosition(e, canvasRef, viewport);

        try {
          const file = await editor.projectManager.readFile(internalGlb);
          const groupUUID = await loadGLTFFromFile(file, editor);
          if (dropPosition[0] !== 0 || dropPosition[2] !== 0) {
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
        const dropPosition = computeDropPosition(e, canvasRef, viewport);

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

    // Restore camera snapshot after mount (controls rebuilt by mount, so restore AFTER)
    const panelId = area?.id;
    if (panelId) {
      const snap = getSnapshot(panelId);
      if (snap) {
        viewport.cameraCtrl.camera.position.fromArray(snap.position);
        viewport.cameraCtrl.controls.target.fromArray(snap.target);
        viewport.cameraCtrl.controls.update();
      }
    }
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
    // Save camera snapshot before disposing
    const panelId = area?.id;
    if (panelId && viewport) {
      setSnapshot(panelId, {
        position: viewport.cameraCtrl.camera.position.toArray() as [number, number, number],
        target: viewport.cameraCtrl.controls.target.toArray() as [number, number, number],
      });
    }
    viewport?.dispose();
    viewport = null;
  });

  return (
    <div
      data-devid="viewport-panel"
      ref={containerRef}
      style={{
        width: 'calc(100% - 6px)',
        height: 'calc(100% - 6px)',
        display: 'flex',
        'flex-direction': 'column',
        overflow: 'hidden',
        background: 'var(--bg-app)',
        'box-shadow': 'var(--shadow-well-outer)',
        'border-radius': 'var(--radius-lg)',
        margin: '3px',
        'box-sizing': 'border-box',
      }}
    >
      <PanelHeader title="Viewport" actions={
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '2px',
          'user-select': 'none',
        }}>
          <For each={(['wireframe', 'solid', 'shading', 'rendering'] as ShadingMode[])}>
            {(mode) => (
              <button
                onClick={() => setRenderMode(mode)}
                onMouseEnter={() => setHoveredShading(mode)}
                onMouseLeave={() => setHoveredShading(null)}
                style={{
                  background: renderMode() === mode
                    ? 'var(--bg-active)'
                    : hoveredShading() === mode
                      ? 'var(--bg-hover)'
                      : 'transparent',
                  border: 'none',
                  color: renderMode() === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  'border-radius': '3px',
                  'font-size': '10px',
                  'font-weight': renderMode() === mode ? '600' : '400',
                  height: '18px',
                  transition: 'background 0.1s',
                }}
              >
                {mode === 'wireframe' ? 'Wire' :
                 mode === 'solid' ? 'Solid' :
                 mode === 'shading' ? 'Shading' : 'Render'}
              </button>
            )}
          </For>
        </div>
      } />
      <div
        ref={canvasRef}
        style={{
          flex: '1',
          position: 'relative',
          overflow: 'hidden',
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
      {/* Rendering 懸浮面板 */}
      <Show when={renderMode() === 'rendering'}>
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '220px',
          'max-height': 'calc(100% - 56px)',
          'overflow-y': 'auto',
          background: 'var(--bg-app)',
          'border-radius': '6px',
          border: '1px solid rgba(255,255,255,0.1)',
          'z-index': '6',
          'font-size': '11px',
          color: 'var(--text-secondary, #aaa)',
          'user-select': 'none',
        }}>
          {/* 面板 Header（可摺疊整個面板） */}
          <div
            onClick={() => setPanelExpanded(v => !v)}
            style={{
              padding: '8px 10px',
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              cursor: 'pointer',
              'border-bottom': panelExpanded() ? '1px solid rgba(255,255,255,0.1)' : 'none',
            }}
          >
            <span style={{ 'font-size': '9px', width: '10px' }}>{panelExpanded() ? '\u25BE' : '\u25B8'}</span>
            <span style={{ color: 'var(--text-primary, #fff)', 'font-weight': '600' }}>Render Effects</span>
          </div>

          <Show when={panelExpanded()}>
            {/* ── Quality 群組 ── */}
            <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div
                onClick={() => toggleGroup('quality')}
                style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
              >
                <span style={{ 'font-size': '9px', width: '10px' }}>{isGroupOpen('quality') ? '\u25BE' : '\u25B8'}</span>
                <span style={{ color: 'var(--text-primary, #fff)' }}>Quality</span>
              </div>
              <Show when={isGroupOpen('quality')}>
                <div style={{ padding: '4px 10px 8px', 'padding-left': '26px', display: 'flex', gap: '4px' }}>
                  <For each={(['low', 'normal', 'high'] as QualityLevel[])}>
                    {(q) => (
                      <button
                        onClick={() => setQuality(q)}
                        style={{
                          flex: 1,
                          background: quality() === q ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                          border: 'none',
                          color: quality() === q ? 'var(--text-primary, #fff)' : 'var(--text-muted, #666)',
                          padding: '3px 0',
                          cursor: 'pointer',
                          'border-radius': '3px',
                          'font-size': '10px',
                          'text-transform': 'capitalize',
                        }}
                      >
                        {q}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* ── Effects 群組（包裹所有效果子群組） ── */}
            <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div
                onClick={() => toggleGroup('effects')}
                style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
              >
                <span style={{ 'font-size': '9px', width: '10px' }}>{isGroupOpen('effects') ? '\u25BE' : '\u25B8'}</span>
                <span style={{ color: 'var(--text-primary, #fff)' }}>Effects</span>
              </div>
              <Show when={isGroupOpen('effects')}>
                <div style={{ 'padding-left': '10px' }}>

                  {/* Tone Mapping */}
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div
                      onClick={() => toggleGroup('toneMapping')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
                    >
                      <span style={{ 'font-size': '9px', width: '10px' }}>{isGroupOpen('toneMapping') ? '\u25BE' : '\u25B8'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={renderSettings().toneMapping.enabled}
                          onChange={e => updateSetting('toneMapping', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Tone Mapping</span>
                      </label>
                    </div>
                    <Show when={isGroupOpen('toneMapping') && renderSettings().toneMapping.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div>
                          <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '2px' }}>
                            <span>Mode</span>
                          </div>
                          <select
                            value={renderSettings().toneMapping.mode}
                            onChange={e => updateSetting('toneMapping', { mode: e.target.value as 'aces' | 'agx' | 'neutral' | 'reinhard' | 'cineon' })}
                            style={{
                              width: '100%',
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: 'var(--text-primary, #fff)',
                              padding: '2px 4px',
                              'border-radius': '3px',
                              'font-size': '10px',
                            }}
                          >
                            <option value="aces">ACES</option>
                            <option value="agx">AgX</option>
                            <option value="neutral">Neutral</option>
                            <option value="reinhard">Reinhard</option>
                            <option value="cineon">Cineon</option>
                          </select>
                        </div>
                        <div>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                            <span style={{ 'white-space': 'nowrap' }}>Exposure</span>
                            <NumberDrag
                              value={renderSettings().toneMapping.exposure}
                              onChange={v => updateSetting('toneMapping', { exposure: v })}
                              min={0.1}
                              max={3}
                              step={0.05}
                              precision={2}
                            />
                          </div>
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* Bloom */}
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div
                      onClick={() => toggleGroup('bloom')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
                    >
                      <span style={{ 'font-size': '9px', width: '10px' }}>{isGroupOpen('bloom') ? '\u25BE' : '\u25B8'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={renderSettings().bloom.enabled}
                          onChange={e => updateSetting('bloom', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Bloom</span>
                      </label>
                    </div>
                    <Show when={isGroupOpen('bloom') && renderSettings().bloom.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap', 'text-transform': 'capitalize' }}>strength</span>
                          <NumberDrag
                            value={renderSettings().bloom.strength}
                            onChange={v => updateSetting('bloom', { strength: v })}
                            min={0}
                            max={3}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap', 'text-transform': 'capitalize' }}>radius</span>
                          <NumberDrag
                            value={renderSettings().bloom.radius}
                            onChange={v => updateSetting('bloom', { radius: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap', 'text-transform': 'capitalize' }}>threshold</span>
                          <NumberDrag
                            value={renderSettings().bloom.threshold}
                            onChange={v => updateSetting('bloom', { threshold: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* AO */}
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div onClick={() => toggleGroup('ao')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ 'font-size': '9px', width: '10px' }}>{isGroupOpen('ao') ? '\u25BE' : '\u25B8'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={renderSettings().ao.enabled}
                          onChange={e => updateSetting('ao', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Ambient Occlusion</span>
                      </label>
                    </div>
                    <Show when={isGroupOpen('ao') && renderSettings().ao.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Radius</span>
                          <NumberDrag
                            value={renderSettings().ao.radius}
                            onChange={v => updateSetting('ao', { radius: v })}
                            min={0.01}
                            max={0.5}
                            step={0.005}
                            precision={3}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Intensity</span>
                          <NumberDrag
                            value={renderSettings().ao.intensity}
                            onChange={v => updateSetting('ao', { intensity: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* DOF */}
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div onClick={() => toggleGroup('dof')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ 'font-size': '9px', width: '10px' }}>{isGroupOpen('dof') ? '\u25BE' : '\u25B8'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={renderSettings().dof.enabled}
                          onChange={e => updateSetting('dof', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Depth of Field</span>
                      </label>
                    </div>
                    <Show when={isGroupOpen('dof') && renderSettings().dof.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Focus</span>
                          <NumberDrag
                            value={renderSettings().dof.focus}
                            onChange={v => updateSetting('dof', { focus: v })}
                            min={0.1}
                            max={100}
                            step={0.1}
                            precision={1}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Aperture</span>
                          <NumberDrag
                            value={renderSettings().dof.aperture}
                            onChange={v => updateSetting('dof', { aperture: v })}
                            min={0.001}
                            max={0.1}
                            step={0.001}
                            precision={3}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Max Blur</span>
                          <NumberDrag
                            value={renderSettings().dof.maxBlur}
                            onChange={v => updateSetting('dof', { maxBlur: v })}
                            min={0.001}
                            max={0.05}
                            step={0.001}
                            precision={3}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* Motion Blur */}
                  <div>
                    <div onClick={() => toggleGroup('motionBlur')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ 'font-size': '9px', width: '10px' }}>{isGroupOpen('motionBlur') ? '\u25BE' : '\u25B8'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={renderSettings().motionBlur.enabled}
                          onChange={e => updateSetting('motionBlur', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Motion Blur</span>
                      </label>
                    </div>
                    <Show when={isGroupOpen('motionBlur') && renderSettings().motionBlur.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Strength</span>
                          <NumberDrag
                            value={renderSettings().motionBlur.strength}
                            onChange={v => updateSetting('motionBlur', { strength: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      {/* Shading 懸浮面板 */}
      <Show when={renderMode() === 'shading'}>
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '220px',
          'max-height': 'calc(100% - 56px)',
          'overflow-y': 'auto',
          background: 'var(--bg-app)',
          'border-radius': '6px',
          border: '1px solid rgba(255,255,255,0.1)',
          'z-index': '6',
          'font-size': '11px',
          color: 'var(--text-secondary, #aaa)',
          'user-select': 'none',
        }}>
          {/* 面板 Header */}
          <div
            onClick={() => setShadingExpanded(v => !v)}
            style={{
              padding: '8px 10px',
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              cursor: 'pointer',
              'border-bottom': shadingExpanded() ? '1px solid rgba(255,255,255,0.1)' : 'none',
            }}
          >
            <span style={{ 'font-size': '9px', width: '10px' }}>{shadingExpanded() ? '\u25BE' : '\u25B8'}</span>
            <span style={{ color: 'var(--text-primary, #fff)', 'font-weight': '600' }}>Shading Controls</span>
          </div>

          <Show when={shadingExpanded()}>
            {/* Scene Lights */}
            <div style={{ padding: '8px 10px', 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <label style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={sceneLightsOn()}
                  onChange={e => setSceneLightsOn(e.target.checked)} />
                <span style={{ color: 'var(--text-primary, #fff)' }}>Scene Lights</span>
              </label>
            </div>

            {/* HDR Preset */}
            <div style={{ padding: '8px 10px', 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ 'margin-bottom': '6px', color: 'var(--text-primary, #fff)' }}>HDR Preset</div>
              <select
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-primary, #fff)',
                  padding: '3px 6px',
                  'border-radius': '3px',
                  'font-size': '11px',
                }}
              >
                <option value="room">Room</option>
              </select>
            </div>

            {/* HDR Intensity */}
            <div style={{ padding: '8px 10px', 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <span style={{ 'white-space': 'nowrap' }}>Intensity</span>
                <NumberDrag
                  value={hdrIntensity()}
                  onChange={v => setHdrIntensity(v)}
                  min={0}
                  max={3}
                  step={0.05}
                  precision={2}
                />
              </div>
            </div>

            {/* HDR Rotation */}
            <div style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <span style={{ 'white-space': 'nowrap' }}>Rotation</span>
                <NumberDrag
                  value={hdrRotation()}
                  onChange={v => setHdrRotation(Math.round(v))}
                  min={0}
                  max={360}
                  step={1}
                  precision={0}
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>
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
