# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307

## Git 規則
- 工作分支：feat/multiselect-core
- commit 訊息格式：`[core] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[core] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->
- [ ] 多選功能 — core 層（#9）
  - **Selection.ts**：
    - `_selected` 從 `Object3D | null` 改為 `Set<Object3D>`
    - 新增方法：`add(obj)`, `remove(obj)`, `toggle(obj)`, `has(obj)`
    - 新增 getter：`all` (readonly Object3D[]), `count`, `primary`（最後加入的）
    - `select(obj)` 改為：清除舊選取 + 選新的（普通點擊行為）
    - `select(null)` 等同 `clear()`
    - 事件改發 `selectionChanged`，payload 為 `Object3D[]`
    - `clear()` 改為清除 Set + emit `selectionChanged([])`
  - **EventEmitter.ts**：
    - `EditorEventMap` 中將 `objectSelected` 替換為 `selectionChanged: [objects: Object3D[]]`
  - **Editor.ts**：
    - `removeObject()` 中：如果被移除的物體在選取集合中（`selection.has(obj)`），呼叫 `selection.remove(obj)`
  - 參考根目錄 CLAUDE.md「介面契約：多選功能」取得完整 API 規格

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
