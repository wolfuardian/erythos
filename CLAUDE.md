# Erythos — 3D Editor

## 環境需求

- Node.js
- GitHub CLI (`gh`) — 用於開 issue、建 PR。安裝：`winget install GitHub.cli`，首次需 `gh auth login`
- `gh` 安裝後需重啟 shell 才能找到，路徑：`/c/Program Files/GitHub CLI`

## 專案慣例

- 語言：TypeScript（strict mode）
- UI 框架：SolidJS（用 createSignal, createEffect, onMount, onCleanup）
- 3D 引擎：Three.js
- 面板佈局：Dockview
- 建置工具：Vite
- 樣式：inline style + CSS 變數 var(--bg-*), var(--text-*)

## 架構原則

- **Command 模式**：所有場景變更必須透過 Command + editor.execute()，確保 undo/redo
- **事件驅動**：Editor 發事件 → Bridge 更新 signal → 面板自動重渲染
- **事件順序**：objectAdded → sceneGraphChanged（不能反過來）
- **模組邊界**：core/ 不依賴 UI，panels/ 透過 bridge 取得狀態，viewport/ 不處理檔案 I/O

## 介面契約：GLTF 導入

### 共用工具函式（src/utils/gltfLoader.ts）

```typescript
export async function loadGLTFFromFile(file: File, editor: Editor): Promise<void>
```
- 職責：讀取檔案 → GLTFLoader 解析 → 包成 Group → 執行 ImportGLTFCommand
- 成功：模型加入場景，自動選取頂層 Group
- 失敗：throw Error('具體原因')

### 新 Command（src/core/commands/ImportGLTFCommand.ts）

- 整個 GLTF 包成一個 Group 節點，Group.name = 檔名去副檔名
- execute: add to scene → emit objectAdded → emit sceneGraphChanged → select group
- undo: remove from scene → emit objectRemoved → emit sceneGraphChanged → deselect

### 錯誤對話框（src/components/ErrorDialog.tsx）

```typescript
interface ErrorDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}
```
- 通用元件，不綁定 GLTF 邏輯

### 分支策略

| 分支 | 負責模組 | 改動檔案 |
|------|---------|---------|
| feat/gltf-core | src/core/, src/utils/ | ImportGLTFCommand, gltfLoader, commands/index |
| feat/gltf-viewport | src/viewport/, src/panels/viewport/ | ViewportPanel 拖放 |
| feat/gltf-ui | src/components/ | ErrorDialog, Toolbar Import 按鈕 |

合併順序：core 先 merge，然後 viewport 和 ui 可同時 merge。

## 協作角色與流程

### 角色分工

| 角色 | 職責 | 權限 |
|------|------|------|
| 指揮家（使用者） | 提出意圖與方向，做最終決策 | 全部 |
| 主腦（主控 session） | 理解全貌、編輯文件、建置規範、協調成員、檢視文件一致性、建議並執行 merge | 全部 |
| 參謀 | 幫指揮家轉化意圖為有效指令、模擬測試、診斷溝通問題 | 只讀所有文件，可寫 advisor/ |
| 開發 agent | 在指定分支實作功能，完成後 commit + push | 只改自己分支允許的檔案 |
| QC agent | 審查分支品質，開/關 GitHub issue | 只讀 src/，可寫 qc/，可操作 gh issue |
| 校閱 | 糾正所有文件的錯字、排版、用詞不一致 | 可改所有 .md，不改 src/ |

### Merge 流程

1. 開發 agent 完成實作 → commit + push
2. 主腦指派 QC 審查
3. QC 審查：有問題開 GitHub issue，沒問題回報 PASS
4. 主腦向指揮家報告結果並建議：
   - **PASS** → 指揮家同意後，主腦執行 merge
   - **有 issue** → 主腦寫進對應模組 CLAUDE.md 待修項 → 開發 agent 修復 → 回到步驟 2

### Merge 後收尾

merge 完成後，主腦依序執行：

1. push master 到 remote
2. 移除已 merge 分支的 worktree（`git worktree remove`）
3. 刪除本地 feat 分支（`git branch -d`）
4. 刪除遠端 feat 分支（`git push origin --delete`）
5. 清理各模組 CLAUDE.md：
   - 清空「當前任務」（保留標題和註解佔位）
   - 清空「待修項」和「上報區」的內容
   - 移除 Git 規則中已過期的工作分支名稱
6. 跑一次整合 build 確認無錯誤
7. commit 收尾改動並 push

### 文件維護流程

- 主腦更新文件後 → 校閱檢查文字品質 → 主腦檢視文件間一致性 → **主腦將 master merge 進所有 active feat 分支**
- 指揮家需要下指令時 → 參謀提供 prompt 建議
- 指揮家與成員溝通不順時 → 參謀診斷問題根因

### 開發成員 SOP
所有開發 agent 遵守 [docs/dev-sop.md](docs/dev-sop.md)。
