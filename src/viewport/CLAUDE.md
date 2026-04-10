# Viewport 模組

## 範圍限制
只能修改 src/viewport/ 和 src/panels/viewport/ 底下的檔案。
不得修改 src/core/、src/components/、src/app/、src/panels/properties/、src/panels/scene-tree/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] 框選選中物體（#10）

  ### 新增 `src/viewport/BoxSelector.ts`
  - 監聽左鍵（button 0）的 pointerdown / pointermove / pointerup
  - 拖曳超過 4px 閾值時啟動框選模式（與 SelectionPicker 的點擊判定一致，互不衝突）
  - 拖曳期間在 container 上顯示一個半透明矩形 overlay（HTML div，absolute 定位）
  - 拖曳結束時：
    1. 遍歷 `scene.children`（跳過 ignoreObjects 集合中的物體）
    2. 對每個物體用 `Vector3.project(camera)` 投射到螢幕空間
    3. 判斷投射點是否在框選矩形內
    4. 收集命中的物體陣列，呼叫 callback
  - interface：
    ```typescript
    interface BoxSelectorCallbacks {
      onBoxSelect: (objects: Object3D[], modifier: { ctrl: boolean }) => void;
      requestRender: () => void;
    }
    ```
  - 需要 `addIgnore(obj)` 方法，跳過 gizmo helper 等
  - `mount(container: HTMLElement, scene: Scene, camera: Camera)` + `dispose()`

  ### 修改 `src/viewport/Viewport.ts`
  - import 並建立 BoxSelector 實例
  - `mount()` 中掛載 BoxSelector，加入 gizmo ignore
  - `ViewportCallbacks` 新增：
    ```typescript
    onBoxSelect: (objects: Object3D[], modifier: { ctrl: boolean }) => void;
    ```

  ### 修改 `src/panels/viewport/ViewportPanel.tsx`
  - 傳入 `onBoxSelect` callback：
    - 無 Ctrl：`editor.selection.select(null)` 清除，再逐一 `editor.selection.add(obj)`
    - 有 Ctrl：逐一 `editor.selection.add(obj)`
    - 框內無物體 + 無 Ctrl：`editor.selection.select(null)` 清除選取

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 用 SolidJS 的 onMount/onCleanup 管理 DOM 事件監聽
- 用 createSignal 管理元件狀態
- 不要在 Viewport class 內部處理檔案 I/O，拖放邏輯留在 ViewportPanel 元件層
- 樣式用 inline style，配合現有 CSS 變數 var(--bg-*)

## Git 規則
- 工作分支：feat/box-select
- commit 訊息格式：`[viewport] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[viewport] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
