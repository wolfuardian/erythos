# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

**Issue #113 — ProjectPanel Load 適配 SceneDocument 格式**

### 目標
ProjectPanel 的 Load 改用 `editor.loadScene()`，不再依賴 AutoSave 的 `restoreSnapshot()`。

### 步驟

#### 1. 修改 `performLoad`（ProjectPanel.tsx 行 188-203）
- 現行：`restoreSnapshot(editor, data);`
- 改為：
  ```typescript
  const parsed = JSON.parse(data);
  editor.loadScene(parsed);
  ```
- try/catch 已有，ErrorDialog 已接好，不需額外處理

#### 2. 清理 import
- 移除 `import { restoreSnapshot } from '../../../core/scene/AutoSave';`

### 注意事項
- `editor.loadScene()` 由 #111 提供，內部處理 selection/history 清除 + SceneDocument deserialize
- `confirmBeforeLoad` 對話框邏輯不變
- `handleDblClick` → `performLoad` 的流程不變

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## Git 規則
- 工作分支：`feat/projectpanel-sceneformat`
- commit 訊息格式：`[app] 簡述 (refs #113)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[app] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 備忘錄
工作中若有 insight、意外發現、改進建議，寫入 `.ai/memos/#N-簡述.md`（N = issue 編號）。
一個任務最多一個檔案，必須在開 PR 之前 commit + push。主腦 merge 後 review。

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->

**#113 依賴 #111 尚未 merge**

`editor.loadScene()` 由 issue #111（core 模組 `feat/autosave-sceneformat`）負責實作。
目前 build 失敗：`Property 'loadScene' does not exist on type 'Editor'`。

本 PR 程式碼本身正確，待 #111 merge 後 build 即可通過，可直接 QC + merge。
