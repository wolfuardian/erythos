# Erythos — 3D Editor

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
