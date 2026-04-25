# Viewport 前置知識

_Last updated: 2026-04-25 by EX_
_Module path: src/viewport/ + src/panels/viewport/_
_Commit 前綴: [viewport]_

## 檔案速覽

| 檔案 | 職責（1 行） |
|------|------------|
| `Viewport.ts` | 頂層 class，組合所有子系統，對外公開 API |
| `ViewportRenderer.ts` | WebGLRenderer 封裝，RAF loop，render override 接口 |
| `ShadingManager.ts` | per-viewport shading mode + render-time state swap + scene lights layer mask |
| `GizmoManager.ts` | TransformControls 封裝，單/多物件拖曳，pivot 計算 |
| `SelectionPicker.ts` | Raycaster click/hover，ignoreObjects，resolveTarget |
| `BoxSelector.ts` | 框選，overlay DOM，ignoreObjects |
| `CameraController.ts` | OrbitControls 封裝 |
| `PostProcessing.ts` | Bloom/AO/DOF/MotionBlur/ToneMapping，EffectComposer |
| `GridHelpers.ts` | grid + axes 純容器（無 scene.add 邏輯，由 App 層 add） |
| `RenderSettings.ts` | RenderSettings 型別定義與 DEFAULT_RENDER_SETTINGS |
| `dropPosition.ts` | 拖曳放置位置計算（raycaster y=0 平面） |
| `ViewportPanel.tsx` | SolidJS 元件，掛載 Viewport + 子面板 UI + panel state 持久化 |

## 關鍵 Types / Interfaces

- `ViewportCallbacks`: `{ onSelect, onHover, onTransformEnd, onBoxSelect?, onMultiTransformEnd?, isEntity?, resolveTarget? }`
- `ShadingMode`: `'wireframe' | 'solid' | 'shading' | 'rendering'`
- `LookdevPreset`: `'none' | 'room' | 'factory'`
- `ViewportPanelState`: `{ camera?: ViewportSnapshot; sceneLightsOverrides?: Partial<Record<ShadingMode, boolean>>; lookdevPreset?: LookdevPreset; hdrIntensity?: number; hdrRotation?: number }`
- `ViewportSnapshot`: `{ position: [n,n,n]; target: [n,n,n] }`
- `SceneLightsOverrides`: `Partial<Record<ShadingMode, boolean>>` — undefined = mode default

## 生命週期

1. **App.tsx 初始化**：建 `GridHelpers` → `scene.add(grid, axes)` → 傳 `sharedGridObjects` 給 `createEditorBridge`
2. **ViewportPanel onMount**：`new Viewport(editor.threeScene, callbacks)` → `viewport.mount(canvasRef, bridge.sharedGridObjects)`（第二參數 = addIgnore 名單）
3. **ViewportPanel onCleanup**：`setPanelState(workspaceId, areaId, {...})` 寫入持久化 → `viewport.dispose()`

**dispose 順序**（Viewport.dispose）：picker → boxSelector → gizmo → postProcessing → shading → cameraCtrl → vpRenderer

## wrapRender 機制（render-time state swap）

```
Viewport.mount() 裡：
  vpRenderer.setRenderOverride(() => {
    shading.wrapRender(scene, () => postProcessing.render())
  })
```

每幀：`ShadingManager.wrapRender(scene, renderFn)` 做：
1. 捕捉 `scene.overrideMaterial / environment / environmentIntensity / environmentRotation`
2. 依 mode 設定當幀值
3. `renderFn()` → `postProcessing.render()` → Three.js renderer
4. `finally` 完整還原（含 throw 時）

**重要**：`scene.environment` 不在 ShadingManager 之外直接寫；全由 wrapRender 在每幀 set/restore。

## Active Viewport 機制

- `bridge.activeViewportId()` signal（app level）
- ViewportPanel 在 `pointerdown` 與 `pointerenter` 時 `bridge.setActiveViewportId(area.id)`
- `F` focus 快捷鍵：先檢查 `activeViewportId === area.id` 才執行 `viewport.focusObject()`
- W/E/R transform mode：全域 bridge signal，不受 activeViewportId 限制

## Gizmo 跨 Viewport 同步

- `bridge.draggingViewportId()` — 誰在拖，null = 沒在拖
- `bridge.dragTickVersion()` — 拖曳中每幀 bump，非拖曳 viewport 訂閱後 requestRender（讓物件 transform 即時反映）
- 拖曳中：`gizmo.setVisibleForce(draggingId === area.id)`（只 active viewport 顯示 gizmo）
- 拖曳結束：`setVisibleForce(true)` 全部恢復

## Scene Lights Layer Mask

- Scene lights 放 **layer 1**（SceneSync 負責 assign，非 viewport 模組）
- Camera 依 mode 決定 `camera.layers.enable(1)` / `disable(1)`
- Mode default：solid/rendering = on，shading/wireframe = off
- `sceneLightsOverride` (undefined | boolean) 蓋掉 default
- Layer channel 配額：0 = Three.js 預設，1 = scene lights，2-3 = 系統預留，4-31 = user

## HDRI / Lookdev

- **Rendering 模式**：`customEnv ?? defaultEnv`（來自環境面板 `bridge.environmentSettings()`）
- **Shading 模式**：由 `lookdevPreset` signal 決定（none/room/factory-WIP）；factory fallback room
- **Solid/Wireframe**：`scene.environment = null`（明確隔離）
- `setCustomHDRI(DataTexture)` → PMREMGenerator 產 envTexture → **不直接寫 scene.environment**，存 `customEnv`；wrapRender 每幀套用

## 子面板 State 持久化

存於 `workspaceStore.viewportState[workspaceId][areaId]: ViewportPanelState`

**寫入時機**：`onCleanup`（panel 卸載），closure 捕捉 `workspaceId`/`areaId`（**防 race：不在 cleanup 內呼叫 currentWorkspace()**）

**讀取時機**：mount 結束後，`getPanelState(workspaceId, areaId)` 還原 camera / sceneLightsOverrides / lookdevPreset / hdrIntensity / hdrRotation

## 跨檔依賴

- `ViewportPanel.tsx` → `Viewport.ts` → `ShadingManager / GizmoManager / SelectionPicker / BoxSelector / PostProcessing / CameraController / ViewportRenderer`
- `ViewportPanel.tsx` → `bridge.ts`（activeViewportId / draggingViewportId / dragTickVersion / sharedGridObjects）
- `ViewportPanel.tsx` → `viewportState.ts`（getPanelState / setPanelState）
- `ViewportPanel.tsx` → `workspaceStore.ts`（currentWorkspace — closure capture only）
- `App.tsx` → `GridHelpers.ts`（建立 + scene.add，sceneReplaced 時 re-add）

## 已知地雷

- **phantom GridHelpers**（#578）：以前 Viewport.mount 會把自己的 grid add 到 shared scene，N viewport = N 層重疊且 picker 會命中 grid。現已修：App.tsx 建一份，`mount(canvasRef, sharedGridObjects)` 傳入 addIgnore 名單。
- **try/finally 復原 scene state**（#589）：ShadingManager.wrapRender 若 renderFn throw 仍必須還原 scene.environment 等狀態。已用 `try { ... } finally { restore }` 包覆。
- **onCleanup closure capture race**（#588）：panel cleanup 時若直接讀 `currentWorkspace().id` 會拿到「已切走的」workspace。必須在 mount 時 capture `const workspaceId = currentWorkspace().id`，closure 鎖定。
- **gizmo dispose 順序**：GizmoManager.dispose 內必須先 `controls.detach()` 再 detach helper，否則 TransformControls 殘留事件監聽。Viewport.dispose 已依正確順序（gizmo 在 postProcessing 之後，vpRenderer 之前）。
- **ShadingManager.forceApply()**：場景替換（autosave restore）後 scene graph 全換新，mode 相同但材質覆蓋需重建。ViewportPanel 訂 `bridge.sceneVersion()` 後呼叫 `shading.forceApply()`。
- **Solid 模式 checkbox 互動**（spec §4.2）：spec 規定 Solid/Rendering/Wireframe 子面板不開關 checkbox；**src 目前 checkbox 無 disabled 條件**。已知落差，AH 決策是否補 issue。

## 最近 PR

- #595 [chore] multi-viewport spec §4.2 Solid 燈光永遠開（不開 checkbox）
- #594 [viewport] per-mode sceneLights override + sub-panel state workspace 持久化
- #592 [viewport] shading lookdev HDR + HDRI render-time swap
- #591 [viewport] HDRI render-time swap + wrapRender try/finally
- #587 [viewport] camera snapshot 持久化（workspace.viewportState, closure capture）
