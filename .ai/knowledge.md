# Knowledge Base

知識庫由主腦從備忘錄萃取歸檔，按主題組織。
只收非顯而易見的知識，每條標註來源與適用範圍。

**格式**：每條知識後方標註 `⏳ 適用至 <條件>`，條件滿足時主腦應移除該條目。

**清理時機**：
- merge 收尾時 — 檢查本次 merge 是否滿足某條知識的過期條件
- Phase 交接時 — 全面審查，移除所有已過期條目

---

## 事件系統過渡期注意事項（來源：#91 備忘錄）

- ~~`selectionChanged` payload 改為 `string[]`~~ — V2-2 已完成 ✅
- ~~EditorEventMap nodeChanged / Bridge 監聽策略~~ — V2-6 已定案：Bridge 分兩層監聽（editor.events 管 UI 狀態，sceneDocument.events 管場景資料） ✅
- ~~`autosaveStatusChanged` idle 狀態~~ — Phase 4 AutoSave 重構已定案：AutoSave 不需 emit `'idle'`，Bridge signal 初始值 `createSignal('idle')` 已覆蓋語意（來源：#111 備忘錄） ✅

## Command 設計慣例（來源：#93, #94 備忘錄）

- Command 內直接呼叫 `sceneDocument.addNode/removeNode`，不透過 `editor.addNode`。Phase 6 已移除 `editor.addNode/removeObject`，此為唯一正確路徑 ⏳ 永久
- API 改動前，主腦應 grep 所有呼叫點列進任務描述，避免 agent 漏改跨模組消費端。**grep 必須包含 `.tsx`**（`--include="*.ts" --include="*.tsx"`），SolidJS 業務邏輯常在 .tsx 中（來源：#128 教訓） ⏳ 永久
- RemoveNodeCommand 子孫快照用 BFS 收集，execute 反向移除（葉先），undo 正向恢復（父先），確保 parent 參照永遠有效 ⏳ 永久
- 快照用 `structuredClone`（非 shallow spread），防止外部修改破壞 snapshot 不變性 ⏳ 永久
- `Vec3` 是 tuple `[number, number, number]`，複製用 `[...value] as Vec3`，不能用 `.clone()` ⏳ 永久
- `{ [property]: value }` 在 strict mode 推斷為 `{ [x: string]: T }`，需 `as Partial<SceneNode>` 轉型（安全的窄化） ⏳ 永久

## Bridge 架構（來源：#96 備忘錄）

- Bridge 分兩層監聯：`editor.events`（UI 狀態）+ `editor.sceneDocument.events`（場景資料）。新 Command 直接操作 SceneDocument，Bridge 必須監聽 SceneDocument 事件才能收到變更 ⏳ 永久
- `nodes` signal 在所有四個 SceneDocument 事件時都更新，面板只需讀 `nodes()` 即可。`sceneVersion` / `objectVersion` 保留供面板做細粒度最佳化 ⏳ 永久

## SceneNode 欄位缺口（來源：#103 備忘錄）

- SceneNode 無 `type` 欄位，類型從 components 推導。`inferNodeType(node)` 工具函式在 `src/core/scene/inferNodeType.ts`，場景樹 badge 和 Properties 面板已使用 ⏳ 永久
- SetTransformCommand 的 oldValue 需呼叫端傳入（因 canMerge 合併機制，oldValue 必須是操作開始時的快照）。面板場景直接讀 `node.position` 即可，Gizmo 拖曳場景需用拖曳開始時的值 ⏳ 永久

## AutoSave / IO 架構（來源：#111 備忘錄）

- AutoSave 監聽 `sceneDocument.events`（nodeAdded/nodeRemoved/nodeChanged/sceneReplaced），不監聯 editor.events 的 deprecated 事件 ⏳ 永久
- `editor.clear()` 委派 `sceneDocument.deserialize({ version: 1, nodes: [] })`，由 SceneSync 自動清空 Three.js scene，不手動遍歷 `scene.children` ⏳ 永久
- Storage key `erythos-autosave-v3` 使用 SceneFile 格式（`{ version: 1, nodes: [...] }`），v2 格式（Three.js JSON envelope）自動廢棄 ⏳ 適用至下次格式變更

## SceneSync mesh 渲染架構（來源：#117 備忘錄）

- SceneSync 替每個 SceneNode 建立 `new Object3D()` 作為 entity；有 `components.mesh` 時，cloned GLTF 子樹掛在它下面作為 child。transform/parent-child 由 SceneDocument 主導，渲染內容由 ResourceCache 提供 ⏳ 永久
- `MeshComponent.source` 的 `filePath:nodePath` 切割邏輯放在 SceneSync，ResourceCache 只知道 filePath 為快取鍵 ⏳ 永久
- ResourceCache 測試用 module-level `_mockParser` / `_clearParser` 注入 mock，避免 jsdom 無 WebGL 問題 ⏳ 永久

## Editor.init() 非同步初始化（來源：#119 備忘錄）

- `Editor.init()` 是 async：hydrate → autosave restore → AutoSave 啟動。App.tsx 在組件作用域呼叫 `editor.init()`，onCleanup 用 `void initPromise.then(() => editor.dispose())` 確保 init 完成後才 dispose ⏳ 永久
- `Editor.autosave` 從 `readonly` 改為 `autosave!: AutoSave`（non-null assertion），因 async init 無法在 constructor 初始化 ⏳ 永久
- vitest jsdom 無完整 IndexedDB，GlbStore 測試需 `fake-indexeddb` 套件或 mock ⏳ 永久

## GLTF 轉換器注意事項（來源：#118 備忘錄）

- GLTF 節點無 name 時，gltfConverter 用 `obj.type` 作 nodePath 片段（best-effort）。同 parent 下多個同 type 無名節點，cloneSubtree 路徑可能取到第一個——可考慮加 index 後綴改善 ⏳ 適用至 nodePath 精確化

## UUID ↔ Object3D 轉換層（來源：#105 備忘錄）

- 轉換集中在 ViewportPanel（UI 層），core/Selection 和 bridge 完全不持有 Object3D，未來換 3D 引擎只需改 ViewportPanel ⏳ 永久
- `sceneSync.getUUID(obj)` 回傳 null 是正常情境（helper 物件不在 SceneSync 中），null guard 是語意過濾非錯誤防護 ⏳ 永久
- `.filter(Boolean)` 無法窄化 `(T | null)[] → T[]`，需用明確型別守衛 `.filter((o): o is T => o !== null)` ⏳ 永久

## File System Access API（來源：#309 實作）

- TS DOM lib 不含 FSAA 型別。`FileSystemDirectoryHandle.entries()` / `.values()` 必須 `(handle as any).entries()` 強制轉型。codebase 既定 pattern，參考 `src/core/ProjectManager.ts:162` ⏳ 適用至 TS 新增 FSAA lib
- 迭代 child entries：`for await (const [, h] of (p as any).entries() as AsyncIterable<[string, FileSystemHandle]>) { ... }`
- Permission error / AbortError 一律 try/catch，fallback 視 UX 而定（#309 fallback 為「無衝突」，不顯示錯誤） ⏳ 永久

## 樣式變數（來源：theme.css 掃檔）

- 錯誤 / 危險紅色：`var(--accent-red)`（`#c04040`，定義於 `src/styles/theme.css:30`） ⏳ 永久
- Input border 變紅 + 錯誤文字同時使用 `var(--accent-red)`（參考 #309） ⏳ 永久
- 文字色三層：`--text-primary` / `--text-secondary` / `--text-muted` ⏳ 永久
- 背景面板色：`--bg-panel` / `--bg-section` ⏳ 永久
- 圓角：`--radius-sm` / `--radius-md` ⏳ 永久

## ConfirmDialog API（來源：#311）

```ts
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;  // default 'OK'
  cancelLabel?: string;   // default 'Cancel'
}
```

- Named export：`import { ConfirmDialog } from '<path>/components/ConfirmDialog'`
- 內建 Escape key 關閉（觸發 `onCancel`）
- 遮罩點擊觸發 `onCancel`
- **不支援** `variant` / `danger` / 紅色 destructive 按鈕，需要時另開 issue 擴充
- SolidJS 限制：**不要 destructure props**，保持 `props.xxx` 存取。用 `??` 非 `||` 設預設值
⏳ 適用至 ConfirmDialog 下次重構

## Solid DevTools 組件命名（來源：本 session 討論）

- 頂層約 20 個 named components（panels / dialogs / toolbar），Solid DevTools 看得到
- panel 內的子區塊多為 inline JSX（div），無 named component
- 定位子元素：Solid DevTools 帶到 `XxxPanel` → outerHTML（文字 / inline style 片段）grep ⏳ 永久

## 專案 workflow 慣例

- Issue body 含 `Depends-on: #N` → 必須等 #N 合併後才能合本 issue
- Issue body 含 `Mockup: .ai/previews/xxx.html` → mockup 是 design history / 視覺規格 source of truth，**PM 嚴禁刪除**，由 AH 親自判斷是否過時（2026-04-18 修正） ⏳ 永久
- 豁免級變更（純文字 / 單一 CSS / 純邏輯 bug）可走 Fast path，AH 自寫任務跳過 AT
- 跨模組 API / 既有 util / component props 不明時，開 issue 前先查 `.ai/module-cache/<module>.md`（DB）；DB 不存在或資訊不足 → spawn EX 按需探勘並寫入 DB（2026-04-18 改制：舊 Pre-flight RD / push-mode RDM 廢除，改 pull-mode EX） ⏳ 永久
- AD 面對多個獨立檔案改動時，可 spawn subAD 並行；單檔或邏輯耦合任務仍親自實作 ⏳ 永久
- Agent 工具呼叫必須明確 `model: 'sonnet'`（或 `'opus'`），不指定會默默升 Opus ⏳ 永久

## AH 方法論（來源：本 session 2026-04-17 指揮家叮）

### 多工預設
多任務預設「並行推進」，不序列執行。多個 issue / worktree / agent 可同步開動。僅有明確依賴（pre-flight 結果決定修法方向）才等。

### Task 工具輕量
GitHub issue / PR / worktree / subagent 是真實外部載體。`TaskCreate` 僅用於「本 session 無外部載體的多步驟流程」。多工情境直接看 `gh issue list` / `git worktree list`，不為每個 issue 複製一份到本地 task。

### Worktree 命名語意化
格式 `erythos-<issue>-<slug>`（例：`erythos-318-glb-transform`）。避免純數字（`erythos-315` / `erythos-317`），`ls` / `git worktree list` 才能一眼看出內容。

### 主動掃 memos，不盲信 PM
PM 的 memo 掃描可能遺漏（working directory / worktree 邊界差異）。AH 每個 PM 後自己掃主 repo + 所有 active worktree 的 `.ai/memos/`。memo 處置優先序：新 bug / feature → 開 issue；方法論 / 設計哲學 → 歸檔本檔；瑣碎 → 刪除。

### 共通哲學
以上四條指向同一原理：**AH 不委機械流程或下游 agent 做判斷**。多工是預設；工具服務判斷；命名服務讀者；掃描決策是 AH 職責。

## 拖放 / FSA API 常見陷阱（來源：#328 memo）

- **writeFile 不自動 emit/rescan**：`ProjectManager.writeFile` 純粹寫檔、不觸 UI 更新。新增資產後需明確 `await this.rescan()`，否則 `bridge.projectFiles()` 不更新
- **findFreeName 用 FSA getFileHandle 試探**：靠 `getFileHandle(name)` 拋 `NotFoundError` 判斷檔案是否存在，需精確捕這個 error type，其他 error 重拋；extension-less 名稱要用 `lastIndexOf('.') >= 0` 判斷
- **onDragOver 必須 preventDefault**：否則 `drop` event 不會觸發（HTML5 Drag API 規格），任何 drop target 必加
- **onDragLeave child 元素觸發**：子元素 hover 會連動觸發父層 `dragleave`，造成 visual state 閃爍。用 `e.currentTarget.contains(e.relatedTarget)` 過濾
- **UI 顯示字串 vs code 寫死資料夾名**：createProject 建立的資料夾清單若擴增（如 3 → 6），Browser mode 空狀態提示 / Preview 等 hardcoded 字串需同步更新，否則 UI 撒謊（#328 QC FAIL 案例）

## Audit script Dockview selector pattern（來源：#362 三輪、#363 實作）

寫 panel audit playwright seed 時，**Dockview UI 沒有 ARIA `role="tab"`、沒有 `data-view-id` attribute**。AT / AD 不要按 W3C standard 假設，必用 `.dv-*` class。

- **Tab click**：`page.locator('.dv-default-tab-content', { hasText: '<TabName>' }).first().click()` ⏳ 永久
- **Panel content container**：`page.locator('.dv-content-container').filter({ hasText: '<panel 內唯一文字>' })`（例：environment 用 'HDR Image'）⏳ 永久
- **`getByText('Scene', { exact: true })` 是碰巧 work**：Scene panel 內文連著 row 文字（"SceneBCubeS..."），`exact` 過濾掉複合文字、只命中 tab 字。其他 panel 內文簡單，header 純文字會跟 tab 撞名 → 不可套用此 pattern ⏳ 永久
- **多態 panel 用全頁截圖規避 locator 不穩**：properties panel 「無選中」與「選中後」DOM 內文差異大，難找跨態穩定的 panel locator → 直接 `page.screenshot()` 全頁截，DV 看 panel 區域即可 ⏳ 適用至 panel 內文穩定後
