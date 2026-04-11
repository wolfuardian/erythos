# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] SceneDocument 實作（#82）
  - 新增 `src/core/scene/SceneDocument.ts`：
    - 內部儲存：`Map<string, SceneNode>`（UUID → SceneNode）
    - CRUD：
      - `addNode(node: SceneNode): void` → emit nodeAdded
      - `removeNode(uuid: string): void` → emit nodeRemoved
      - `updateNode(uuid: string, patch: Partial<SceneNode>): void` → emit nodeChanged
    - Query：
      - `getNode(uuid: string): SceneNode | null`
      - `getChildren(parentUuid: string): SceneNode[]` — 依 order 排序
      - `getRoots(): SceneNode[]` — parent === null
      - `getAllNodes(): SceneNode[]`
    - Path 查詢 API：
      - `getPath(uuid: string): string` — 回傳 "Scene/props/chair"
      - `findByPath(path: string): SceneNode | null` — 首個匹配
    - 序列化（IO 是純 dump/load）：
      - `serialize(): SceneFile` — `{ version: 1, nodes: [...] }`
      - `deserialize(data: SceneFile): void` — 替換全部 nodes → emit sceneReplaced
    - 工具：
      - `createNode(name: string, parent?: string): SceneNode` — 生成 UUID + 預設值
      - `hasNode(uuid: string): boolean`
    - 事件系統：SceneDocument 有自己的 EventEmitter（nodeAdded / nodeRemoved / nodeChanged / sceneReplaced）
  - 新增測試 `src/core/scene/__tests__/SceneDocument.test.ts`：
    - addNode → getNode 取得
    - removeNode → getNode 回傳 null
    - updateNode → 驗證欄位更新
    - getChildren 排序正確
    - serialize → deserialize round-trip 一致
    - getPath / findByPath 正確
  - 型別從 `src/core/scene/SceneFormat.ts` import（V1-1 已建立）
  - UUID 生成使用 `crypto.randomUUID()`

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307

## Git 規則
- 工作分支：feat/scene-document
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

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
