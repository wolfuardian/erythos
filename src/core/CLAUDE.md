# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務：GLTF 導入 — Core 層

### 1. 建立 src/core/commands/ImportGLTFCommand.ts
- 繼承 Command，type = 'ImportGLTF'
- constructor(editor: Editor, group: Group, parent?: Object3D)，parent 預設 editor.scene
- execute(): parent.add(group) → emit('objectAdded', group) → emit('sceneGraphChanged') → selection.select(group)
- undo(): parent.remove(group) → emit('objectRemoved', group, parent) → emit('sceneGraphChanged') → selection.select(null)
- 參考 AddObjectCommand 的模式

### 2. 在 src/core/commands/index.ts 匯出 ImportGLTFCommand

### 3. 建立 src/utils/gltfLoader.ts
```typescript
export async function loadGLTFFromFile(file: File, editor: Editor): Promise<void>
```
- 用 FileReader 讀成 ArrayBuffer（或 file.arrayBuffer()）
- 用 `new GLTFLoader().parseAsync(buffer, '')` 解析
- gltf.scene.name = 檔名去副檔名（例如 "model.glb" → "model"）
- 執行 `editor.execute(new ImportGLTFCommand(editor, gltf.scene))`
- 解析失敗要 throw Error('具體原因')，不要靜默吞掉
- import 路徑：`import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'`

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'` 和 `'three/examples/jsm/loaders/GLTFLoader'`

## Git 規則
- 工作分支：feat/gltf-core
- commit 訊息格式：`[core] 簡述`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 上報區（供主控者 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
