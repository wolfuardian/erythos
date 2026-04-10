# GLTF Import Feature Design

## Overview

為 Erythos 3D 編輯器加入 GLTF/GLB 模型導入功能，支援拖放和工具列按鈕兩種入口，導入失敗時顯示詳細錯誤對話框。

## 需求

- **導入方式：** 拖放至視口 + 工具列按鈕開啟檔案選擇器
- **支援格式：** `.glb`, `.gltf`
- **節點處理：** 保留 GLTF 內部層級，頂層包一個 Group 節點
- **材質處理：** 完整保留 PBR 材質和貼圖
- **導入後行為：** 模型出現在世界原點，相機不動，模型自動選取（顯示 outline + gizmo）
- **錯誤處理：** 彈出對話框說明具體原因（格式錯誤、檔案損壞等）
- **可撤銷：** 導入操作支援 undo/redo

## 架構

### 事件流

```
拖放/按鈕 → loadGLTFFromFile(file, editor) → ImportGLTFCommand
  → editor.execute(cmd)
    → cmd.execute()
      → scene.add(group)
      → emit('objectAdded', group)
      → emit('sceneGraphChanged')
      → selection.select(group)
    → history.push(cmd)
    → emit('historyChanged')
  → bridge 自動更新 sceneVersion signal
  → SceneTreePanel 自動重渲染
  → Viewport 自動顯示 outline + gizmo
```

### 新增檔案

| 檔案 | 負責 Agent | 職責 |
|------|-----------|------|
| `src/utils/gltfLoader.ts` | Core | 讀取檔案、解析 GLTF、執行 Command |
| `src/core/commands/ImportGLTFCommand.ts` | Core | 可撤銷的導入命令 |
| `src/components/ErrorDialog.tsx` | UI | 通用錯誤對話框元件 |

### 修改檔案

| 檔案 | 負責 Agent | 變更 |
|------|-----------|------|
| `src/core/commands/index.ts` | Core | 匯出 ImportGLTFCommand |
| `src/components/Toolbar.tsx` | UI | 加 Import 按鈕 + 錯誤處理 |
| `src/panels/viewport/ViewportPanel.tsx` | Viewport | 加拖放監聽 + 視覺回饋 |

### 不動的檔案

以下檔案**不需修改**，因為現有事件系統已自動處理：

- `src/core/Editor.ts` — 已有 execute()
- `src/app/bridge.ts` — 已監聽 sceneGraphChanged
- `src/panels/scene-tree/SceneTreePanel.tsx` — 已監聽 bridge.sceneVersion()
- `src/viewport/Viewport.ts` — 已處理 selection 變更

## 介面契約

### loadGLTFFromFile

```typescript
// src/utils/gltfLoader.ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { ImportGLTFCommand } from '../core/commands/ImportGLTFCommand';
import type { Editor } from '../core/Editor';

export async function loadGLTFFromFile(file: File, editor: Editor): Promise<void>;
// - 讀取 file 為 ArrayBuffer
// - GLTFLoader.parseAsync() 解析
// - gltf.scene.name = 檔名去副檔名
// - editor.execute(new ImportGLTFCommand(editor, gltf.scene))
// - 失敗 throw Error('具體原因')
```

### ImportGLTFCommand

```typescript
// src/core/commands/ImportGLTFCommand.ts
import type { Group } from 'three';
import { Command } from '../Command';
import type { Editor } from '../Editor';

export class ImportGLTFCommand extends Command {
  readonly type = 'ImportGLTF';
  constructor(editor: Editor, group: Group, parent?: Object3D);
  execute(): void;  // add → objectAdded → sceneGraphChanged → select
  undo(): void;     // remove → objectRemoved → sceneGraphChanged → deselect
}
```

### ErrorDialog

```typescript
// src/components/ErrorDialog.tsx
interface ErrorDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}
// - 半透明遮罩 + 居中卡片 + 標題 + 訊息 + 關閉按鈕
// - 點遮罩或 Escape 關閉
// - 樣式用 inline style + var(--bg-*) CSS 變數
```

## 多 Agent 分工

### 分支策略

```
master
├── feat/gltf-core      ← Agent 1: Command + Loader
├── feat/gltf-viewport   ← Agent 2: 拖放 + 視覺回饋
└── feat/gltf-ui         ← Agent 3: 按鈕 + ErrorDialog
```

三條分支修改的檔案完全不重疊，合併零衝突。

### 模組 CLAUDE.md 部署

每個模組目錄放一份 CLAUDE.md，包含：
- 範圍限制（只能碰哪些檔案）
- 當前任務清單
- 依賴說明（需要的介面由誰提供）
- 慣例（遵循的 pattern）
- Git 規則（分支名、commit 格式）

### 合併順序

1. `feat/gltf-core` 先 merge（提供 loadGLTFFromFile 和 ImportGLTFCommand）
2. `feat/gltf-ui` 和 `feat/gltf-viewport` 可同時 merge（各自獨立）

## 測試驗證

合併後手動驗證：
1. 工具列按鈕選檔導入 → 場景樹出現 Group → 可選取/變換 → undo 消失
2. 拖放 .glb 至視口 → 同上
3. 拖放非 GLTF 檔案 → 彈出錯誤對話框 → 關閉對話框
4. 拖放損壞的 .glb → 彈出錯誤對話框 → 顯示具體原因
