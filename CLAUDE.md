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

合併順序：core 先 merge，然後 viewport 和 components 可同時 merge。

## 介面契約：多選功能（#9）

### Selection 改造（src/core/Selection.ts）

```typescript
class Selection {
  // 內部改為 Set
  private _selected: Set<Object3D>;

  // 取代舊的 select(obj | null)
  select(object: Object3D | null): void;       // 取代選取（清除舊的，選新的）
  add(object: Object3D): void;                  // 追加選取（Ctrl+Click）
  remove(object: Object3D): void;               // 移除單個
  toggle(object: Object3D): void;               // 切換（有就移除，沒就加）
  has(object: Object3D): boolean;               // 是否在選取集合中
  clear(): void;                                // 清除全部
  get all(): readonly Object3D[];               // 取得全部（陣列）
  get count(): number;                          // 數量
  get primary(): Object3D | null;               // 最後加入的（gizmo 附著對象）
}
```
- `select(obj)` = 清除舊選取 + 選新的（普通點擊）
- `select(null)` = `clear()`
- 事件：改發 `selectionChanged`，payload 為 `Object3D[]`

### EventEmitter 新增事件（src/core/EventEmitter.ts）

```typescript
interface EditorEventMap {
  // 取代 objectSelected
  selectionChanged: [objects: Object3D[]];
  // objectHovered 不變
}
```

### Editor 調整（src/core/Editor.ts）

- `removeObject()` 中：如果被移除的物體在選取集合中，從集合移除
- 保持向後相容：如果有其他地方呼叫 `selection.select()`，行為不變

### Bridge 改造（src/app/bridge.ts）

```typescript
interface EditorBridge {
  selectedObjects: Accessor<Object3D[]>;   // 取代 selectedObject
  // 其餘不變
}
```
- 監聽 `selectionChanged` 事件，更新 signal

### SelectionPicker 改造（src/viewport/SelectionPicker.ts）

```typescript
interface PickerCallbacks {
  onSelect: (object: Object3D | null, modifier: { ctrl: boolean }) => void;
  // onHover 不變
}
```
- `onPointerUp` 中讀取 `e.ctrlKey`（Mac 上同時支援 `e.metaKey`）
- 傳給 callback，由 Viewport 層決定呼叫 `select()` 或 `toggle()`

### Viewport 層整合（src/viewport/Viewport.ts）

```typescript
setSelectedObjects(objects: Object3D[]): void {
  this.postProcessing.setSelectedObjects(objects);  // 已支援陣列
  if (objects.length === 1) {
    this.gizmo.attach(objects[0]);
  } else if (objects.length > 1) {
    this.gizmo.attachMulti(objects);                // 新方法
  } else {
    this.gizmo.detach();
  }
}
```

### GizmoManager 多物體 Transform（src/viewport/GizmoManager.ts）

```typescript
attachMulti(objects: Object3D[]): void;
```
- 計算所有物體的包圍盒中心，建立一個臨時 pivot Object3D
- 將 TransformControls 附著到 pivot
- 拖曳時：計算 pivot 的 transform delta，同步套用到所有 objects
- 拖曳結束：回傳所有物體的 startPos/startRot/startScale 供 undo

### SceneTreePanel（src/panels/scene-tree/SceneTreePanel.tsx）

- 普通點擊：`selection.select(obj)`（取代選取）
- Ctrl+Click：`selection.toggle(obj)`（追加/移除）
- 視覺：所有在 `selectedObjects` 中的項目都高亮

### PropertiesPanel（src/panels/properties/PropertiesPanel.tsx）

- `selectedObjects.length === 0`：顯示「No object selected」
- `selectedObjects.length === 1`：現有行為不變
- `selectedObjects.length > 1`：顯示共同屬性，值不同的欄位顯示「—」

### 分支策略

| 分支 | 模組 | 改動 |
|------|------|------|
| feat/multiselect-core | core | Selection, EventEmitter, Editor |
| feat/multiselect-app | app | bridge.ts |
| feat/multiselect-viewport | viewport | SelectionPicker, GizmoManager, Viewport |
| feat/multiselect-scene-tree | scene-tree | SceneTreePanel |
| feat/multiselect-properties | properties | PropertiesPanel |

合併順序：core → app → viewport / scene-tree / properties（可同時）

## 協作角色與流程

### 角色分工

| 角色 | 職責 | 權限 |
|------|------|------|
| 指揮家（使用者） | 提出意圖與方向，做最終決策 | 全部 |
| 主腦（主控 session） | 理解全貌、編輯文件、建置規範、協調成員、檢視文件一致性、建議並執行 merge | 全部 |
| 參謀 | 幫指揮家轉化意圖為有效指令、模擬測試、診斷溝通問題 | 只讀所有文件，可寫 advisor/ |
| 開發 agent | 在指定分支實作功能，完成後 commit + push + 開 PR | 只改自己模組允許的檔案 |
| QC agent | 審查分支品質，開/關 GitHub issue | 只讀 src/，可寫 qc/，可操作 gh issue |

### 開發模組清單

每個模組有獨立的 CLAUDE.md，agent 名稱 = 模組名稱。

| 模組 | 路徑 | commit 前綴 |
|------|------|------------|
| core | src/core/, src/utils/ | `[core]` |
| viewport | src/viewport/, src/panels/viewport/ | `[viewport]` |
| components | src/components/ | `[components]` |
| app | src/app/ | `[app]` |
| scene-tree | src/panels/scene-tree/ | `[scene-tree]` |
| properties | src/panels/properties/ | `[properties]` |

### 分支規則

**所有程式碼變更一律走完整流程：issue → 分支 + worktree → 開發 → PR → QC → merge。**
不論改動大小，不得直接在 master 上修改程式碼。唯一例外是 merge 後的收尾 commit（清理 CLAUDE.md、build 驗證等非程式碼改動）。

一個 issue 對應一條分支、一個 PR。不混搭多個 issue 到同一分支。

分支命名：`fix/<簡述>` 或 `feat/<簡述>`。

### 模組 CLAUDE.md 編寫原則（主腦職責）

開發 agent 在獨立 worktree 中運作，**只依賴 worktree 內的 CLAUDE.md**，不一定會追 SOP 連結。因此主腦在寫模組 CLAUDE.md 時必須確保：

- Git 規則中包含完整的開 PR 步驟（含指令範例），不能只靠引用 dev-sop.md
- 任務描述足夠具體，agent 不需要額外查閱其他文件就能開工
- 工作分支名稱明確寫在 Git 規則中
- **「當前任務」與「待修項」用途不同，不可混用：**
  - 「當前任務」：初始任務指派，主腦準備 worktree 時寫入
  - 「待修項」：QC 審查回報問題後，主腦根據 QC issue 寫入的修正項

### Merge 流程

1. 開發 agent 完成實作 → commit + push → **開 PR**（`gh pr create`）
2. QC 在 PR 上審查：有問題開 issue + request changes，沒問題留 **`QC PASS`** comment
3. 主腦向指揮家報告結果並建議：
   - **QC PASS** → 指揮家同意後，主腦執行 `gh pr merge`
   - **有 issue** → 主腦寫進對應模組 CLAUDE.md 待修項 → 開發 agent 修復 + push → QC 再次 review

> 註：所有 agent 共用同一 GitHub 帳號，無法使用 `--approve`，以 `QC PASS` comment 代替。

### 主腦職責邊界

主腦的執行範圍到「準備 worktree + 寫好模組 CLAUDE.md 任務描述」為止。
**不得自行派開發 agent 實作**，由指揮家決定何時、派誰去做。

### 指揮家提案

指揮家用自然語言描述意圖（不需要寫技術細節），主腦判斷規模後走對應流程。

開 issue 時必須加 label：`bug`、`feature`（全新功能）、`enhancement`（改進現有功能）。

**Bug / 小功能（單一模組可完成）：**
1. 主腦調查後開 GitHub issue（帶 label）
2. 建 fix 或 feat 分支 + worktree，寫進模組 CLAUDE.md 待修項或當前任務
3. 開發 agent 實作 → commit + push → 開 PR
4. QC 審查 PR → approved 後 merge

**大功能（跨模組）：**
1. 主腦設計介面契約，更新根 CLAUDE.md
2. 拆分支（每模組一條），建 worktree，寫各模組 CLAUDE.md 當前任務
3. 開發 agent 各自實作 → commit + push → 各自開 PR
4. QC 逐 PR 審查 → 全部 approved 後依序 merge

### Merge 後收尾

merge 完成後，主腦依序執行：

1. 關閉對應的 GitHub issue（`gh issue close #N`）
2. 移除已 merge 分支的 worktree（`git worktree remove`）
3. 刪除本地 feat 分支（`git branch -d`）
4. 刪除遠端 feat 分支（`git push origin --delete`）
5. pull master 取得 merge commit
6. 清理各模組 CLAUDE.md：
   - 清空「當前任務」（保留標題和註解佔位）
   - 清空「待修項」和「上報區」的內容
   - 移除 Git 規則中已過期的工作分支名稱
6. 跑一次整合 build 確認無錯誤
8. commit 收尾改動並 push

### 文件維護流程

- 主腦更新文件後 → 主腦自行校閱文字品質 + 檢視文件間一致性 → **主腦將 master merge 進所有 active feat 分支**
- 指揮家需要下指令時 → 參謀提供 prompt 建議
- 指揮家與成員溝通不順時 → 參謀診斷問題根因

### 開發成員 SOP
所有開發 agent 遵守 [docs/dev-sop.md](docs/dev-sop.md)。
