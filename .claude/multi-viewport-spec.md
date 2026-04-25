# Multi-Viewport 設計規格

**狀態**：設計共識，未實作
**範圍**：viewport / app / panels/viewport 模組
**背景對話**：2026-04-25 session，指揮家與 AH 對多 viewport 技術難點評斷後收斂

## 目的

Erythos 目前支援多個 ViewportPanel 實例共存（Dockview），但實作上對「哪些狀態該 per-viewport、哪些該 shared」沒有定下規則，導致各種隱性衝突（Shading mode 互相覆蓋、Grid 重複、Gizmo 多實例打架、HDRI intensity 覆蓋等）。

本文件鎖定最終共識，作為未來 issue 拆分與 AT 任務描述的依據。

## 核心原則

1. **Scene 是資料，Viewport 是視窗**
   Scene graph 永遠只有一份乾淨資料。Viewport-local 狀態（shading mode、render settings）由 Viewport class 自己持有，render 時透過 render-time state swap 決定當幀呈現。

2. **不在 scene 儲存 per-viewport 資訊**
   別把「viewport A 用什麼 shading mode」塞進 scene graph 或 scene userData。那會讓資料與呈現混淆。Viewport 自己記，render 時 set → render → restore。

3. **狀態切分有三類**
   - **shared data**：scene graph objects、lights、materials
   - **shared control via bridge**：selection、hover、transform mode
   - **per-viewport**：camera、shading mode、render effects、可見性開關

## 狀態切分決策表

| 概念 | 作用域 | 實作機制 |
|------|-------|---------|
| Scene data（objects / transforms） | shared | scene graph 唯一 |
| Selection | shared via bridge | 現況 OK |
| Hover | shared via bridge | 同時出現於多 viewport 可接受 |
| Camera | per-viewport | viewportState 按 area.id snapshot |
| Shading mode | per-viewport | Viewport class 持 signal，render-time swap |
| Scene lights | shared data，per-viewport **可見性** | Three.js Layers |
| HDRI | shared asset，per-viewport **啟用** | render-time swap `scene.environment` |
| HDRI intensity / rotation | per-viewport（受 shading mode 規則限制） | 同上 |
| Render effects（bloom / AO / DOF） | per-viewport | composer 本來就 local |
| Grid | shared（scene 中單份） | active viewport 決定 raycaster 判定基準 |
| Gizmo 顯示 | 多 viewport 同時可見（Blender 模式） | 每 viewport 自己的 helper，綁同 Object3D |
| Gizmo 互動 | 僅 active viewport | 拖曳中隱藏非 active viewport 的 gizmo helper |
| Transform mode（W/E/R） | 全域同步（bridge signal） | 按 W 所有 viewport 同步切 |
| Transform 拖曳發生位置 | 僅 active viewport | pointer 被 active 獨占 |
| F（focus object） | 僅 active viewport | keyboard 依 active 路由 |

## 機制詳解

### 1. Per-viewport Shading Mode

**規則**：每個 Viewport 實例自己持 shading mode signal，不透過 scene 共享。

**實作**：ShadingManager 從「直接改 scene」改為「在自己 viewport 的 render override 裡 set scene state → render → restore」。

現況 ShadingManager 會：
- 直接寫 `scene.environment`
- 寫 `scene.environmentIntensity` / `environmentRotation`
- `overrideMaterials` 直接 traverse scene 改 material
- `scene.add(this.camera)` 把 headlight 塞進 shared scene

改法：
- 材質 override 不再 traverse scene。改用 `renderer.overrideMaterial` 或 Layer 機制區分渲染（方案未定案，實作時選擇）
- `scene.environment` 改 render-time swap（見下節）
- headlight camera 如果需要 per-viewport 存在，放在 viewport 自己的 sceneHelpers（已經 viewport-local），不塞 shared scene

### 2. Scene Lights：Three.js Layer Mask

**規則**：Scene lights（Light 物件）是 scene graph 的一部分（shared data），但每個 viewport 決定自己**看得到哪些燈**透過 camera layer mask。

**實作**：
- 所有 scene lights assign 到某個約定 layer（例如 layer 1）
- 每個 viewport 的 camera 依 shading mode 決定是否 `camera.layers.enable(1)` / `disable(1)`

**Shading mode 對燈光可見性規則**（指揮家確認）：
- Solid：預設開，子面板可開關
- Shading：預設關，子面板可開關
- Rendering：預設開，不規劃子面板開關
- Wireframe：預設關（對齊 Shading；MeshBasicMaterial 不吃光照，視覺無差，子面板不開關）

### 3. HDRI：scene.environment render-time swap

**規則**：HDRI asset 一份（全域載入），但每個 viewport 渲染時決定是否啟用、用哪份 preset。

**實作**：在每個 viewport 的 render override 裡（`ShadingManager.wrapRender`）：
```
scene.environment = resolvedTexture;  // set（依 mode + preset 決定）
renderFn();
scene.environment = prevEnvironment;  // restore（finally 保護）
```

這不是 hack，是 Three.js **沒有 per-camera environment API** 下的正規做法（官方 example 也用）。swap 在同 viewport 的 render() 前後完成，不跨 frame、不跨 viewport，無 race condition。

**Shading mode 對 HDRI 啟用規則**（#591 更新）：

**Solid / Wireframe**：HDRI 無效，`scene.environment = null`。

**Shading**：Lookdev 模式，由 `LookdevPreset` signal 控制：
- `none`：`scene.environment = null`
- `room`：套用 RoomEnvironment PMREMTexture + intensity + rotation
- `factory`：（WIP）fallback room，UI option 標 `disabled`

**Rendering**：HDRI 有效，`customEnv ?? defaultEnv`，由環境面板開關。

**為何不選 per-material envMap**：
會讓 materials「知道 viewport」，破壞 scene / viewport 分離，否決。

**為何不存進 scene**：
scene.environment 是 Three.js 原生屬性，swap 是利用既有 API 的時序，不需要自訂結構。

### 4. Active Viewport

**規則**：同時只有一個 viewport 是 active。Active 由「最後互動（hover / click）」決定。

**作用**：
- Keyboard 快捷鍵（W/E/R 不受此限，F focus 受此限）
- Gizmo 拖曳發生位置
- Grid / scene raycaster 判定基準

**實作位置**：
- 需要一個新的 app-level signal（例如 `bridge.activeViewportId`）
- 每個 ViewportPanel 在 pointerdown / pointerenter 時 set 自己為 active
- keydown listener 從 window 聽，但執行時先檢查 `activeViewportId === this.panelId` 才響應

**現況問題**（ViewportPanel.tsx line 128-157）：
keydown 掛 window，每個 viewport 都響應，按 F 所有 viewport 的 camera 都飛過去。修正需接入 active viewport 機制。

### 5. Grid：shared + active raycaster

**規則**：Grid 在 scene 中單份（不是每 viewport add 一次），視覺上所有 viewport 都看到。Raycaster（點選 / hover 時判定 pick 到誰）由 active viewport 執行。

**現況問題**（GridHelpers.ts line 18-19）：
每個 viewport mount 時都 `scene.add(this.grid); scene.add(this.axes)`，N viewport = N 層重疊 grid。而且 SelectionPicker 吃 scene.children，會 pick 到別人的 grid。

**改法**：
- Grid 在 app level 建立一次並加入 scene（或放到專屬 group）
- Viewport 不再 add 自己的 grid
- Picker 仍從 scene 掃，但加上 grid 為 `addIgnore` 對象（grid 本來就不該被 picked）

### 6. Gizmo：多實例 + 拖曳隱藏

**規則**（Blender 模式，指揮家確認）：
- 非拖曳狀態：所有 viewport 都看得見 gizmo（每個 viewport 自己的 helper 綁同 Object3D）
- 拖曳中：只 active viewport 顯示 gizmo，其他 viewport 的 helper `visible = false`
- 拖曳結束：恢復 visibility

**為何隱藏而非凍結**：
Gizmo 綁同 Object3D，拖曳中 matrix 變化會讓所有 viewport 的 gizmo 跟著動，視覺上雜亂。隱藏最乾淨。

**TransformControls 多實例對同物件的衝突**：
只有 active viewport 的 gizmo 響應 pointer（透過隱藏 + active viewport 判定），其他 viewport 的 helper 雖然綁在同 Object3D 但不接收事件，所以 matrix cache desync 問題不會發生。

## Layer Channel 配額與使用者自訂相容性

Spec 中 Scene Lights Layer Mask（§4 第 2 節）與 Gizmo 等系統用途會使用 Three.js 的 Layer 機制。Layer 是 scene-wide 的有限資源（32 個 channel / bit 0-31），必須在首次使用前定好配額，避免未來擴充（使用者自訂 Layer、更多系統 overlay）時撞車。

### Three.js Layer 機制 recap

每個 Object3D / Camera / Light 有 `.layers`（`Layers` instance）。Renderer 決策：
- **幾何渲染**：依 `object.layers.test(camera.layers)` 決定該物件是否進該 camera 的 render pass
- **燈光生效**：依 `light.layers.test(camera.layers)` 決定該光源是否進該 camera render pass 的 `lightsArray`

這代表 Three.js 原生支援「**per-camera 決定哪些 mesh 可見**」與「**per-camera 決定哪些 light 生效**」兩種能力，但不支援「**per-object 決定哪些 light 照到它**」（Unity Light 的 Culling Mask 那種 per-object × per-light 的細控），後者需要改 shader chunk。

### 能力分級

| 級別 | 類比 Unity | Three.js 支援 | 代價 |
|------|----------|-------------|------|
| Camera Culling Mask（看到哪些 mesh）| Culling Mask | 原生 | 輕 |
| Camera 決定燈是否生效 | （無直接對應）| 原生（`light.layers`） | 輕 |
| Per-object Light Culling（某燈只照某些 mesh）| Light 的 Culling Mask | **不原生** | 重（改 shader） |

本 spec 範圍只到前兩級。第三級若未來需要，需獨立評估，可能得捨棄 Three.js 內建 PBR shader 改自寫。

### Channel 配額約定

| Channel | 用途 | 狀態 |
|---------|------|------|
| 0 | Three.js 預設，所有物件預設在這 | 保留（Three.js 約定）|
| 1 | System: Scene Lights per-viewport visibility | 規劃中（Scene Lights Layer Mask issue 使用）|
| 2-3 | System: 其他系統用途（gizmo helper、overlay、editor-only 物件等）| 預留 |
| 4-31 | User-defined Layer（未來擴充使用者自訂 Layer 系統）| 預留（28 個可用）|

**實作約束**：任何實作 Scene Lights Layer Mask 或類似系統機制的 issue 必須從 channel 1-3 取號，不得侵占 4-31。若系統需求超過 3 個，需先更新本 spec 配額表再實作。

### 未來使用者自訂 Layer 的擴充路徑

若未來要引入 Unity 風格的使用者自訂 Layer（在 UI 建立 layer 名稱、per-object assign layer、camera / light 選擇 culling mask），擴充大致步驟：

1. **SceneFormat 擴充**：Entity 加 `layer: number` 欄位（屬 scene-format Phase 5+，不在本 spec 處理）
2. **UI**：Layer Manager 面板建立 layer 名稱與 bit 對應、per-entity layer 選擇器、camera / light 的 culling mask UI
3. **Runtime**：SceneSync 將 SceneFormat 的 `layer` 套到 Object3D.layers、套到 Light.layers
4. **（可選）**：若要 per-object light culling（重量級），需改寫 shader chunk 或 fork Three.js PBR shader，獨立立項

前三步用 Three.js 原生機制即可完成，是**中量工程**。第四步是**重量工程**，本 spec 明確不承諾。

## 效能與未來路徑

### Scissor 重構：不做

**決策**：Scissor 能省的是 CPU overhead（scene traversal、state setup、driver overhead），不是 GPU work。大量物件時 GPU 是瓶頸，Scissor 收益反而下降。

**真正可以解決的問題**：
- WebGL context 上限（Chrome ~16）— Scissor 下只 1 個 context
- GPU memory（N 份 render target）

**為何不做**：
- 4 viewport 以內不會撞到 context 上限
- 大工程：post-processing pipeline 要重寫（bloom mipmap blur 假設整張 target，AO/DOF 的鄰近 sample 會跨 viewport 污染）
- Layer mask + HDRI swap + active viewport 三個機制**與 Scissor 完全正交**，做完先用後再決定是否 Scissor

**架構位置保留**：
ViewportRenderer 的 render override 接口要設計得能讓底層 renderer 實作替換。未來若走 Scissor，改 ViewportRenderer 內部即可，上層 Viewport / ShadingManager 不動。

### 不可見 viewport 停 render：未規劃

Dockview 折疊 / tab 切走的 viewport 目前仍跑 effect + requestRender。正確做法：
- IntersectionObserver 或 Dockview visibility API
- 配合 active viewport 機制（非 active 且不可見 → 停）

需要核心層配合（Viewport class 暴露 setActive / setVisible API），本 spec 留為**未來 issue**，不在本輪設計。

## 未解項 / 非目標

- **Per-viewport shading 子面板開關**（Scene Lights toggle 等）：存在 Viewport class 的 signal 即可，細節由該 issue 決
- **Camera snapshot 在 panel 重建後失效**（area.id 可能改變）：已知問題，獨立議題
- **Dockview panel dispose 時 shared scene 的清理**（shading override material 殘留等）：獨立議題，本 spec 不處理

## 實作路徑建議（未拆成 issue）

依賴順序：
1. Active viewport 機制（基礎，其他依賴它）
2. Per-viewport ShadingManager（獨立，可並行）
3. Scene lights Layer mask（依賴 2）
4. HDRI render-time swap（依賴 2）
5. Grid 單份 + picker ignore（獨立）
6. Gizmo 拖曳隱藏非 active（依賴 1）
7. Keyboard 路由到 active viewport（依賴 1）

當實際拆 issue 時，由 AH 依當時狀況決定合併 / 拆分粒度，本 spec 不強制 1 issue = 1 機制。

## 設計取捨備忘

- **為何 Hover 允許跨 viewport 同步**：指揮家接受這個行為，且改 per-viewport hover 代價大（需要 per-viewport picker 協調），收益低
- **為何 Transform mode 全域同步**：按 W 所有 gizmo 同步切 translate/rotate/scale，符合「一個 scene 一個編輯意圖」的心智模型。拖曳互斥已由 active viewport + 拖曳隱藏解決，mode 本身不必 per-viewport
- **為何選 HDRI swap 而不是 per-material envMap**：scene / viewport 分離原則優先於「少一次 state mutation」的效能潔癖
