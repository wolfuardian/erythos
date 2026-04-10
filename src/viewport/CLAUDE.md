# Viewport 模組

## 範圍限制
只能修改 src/viewport/ 和 src/panels/viewport/ 底下的檔案。
不得修改 src/core/、src/components/、src/app/、src/panels/properties/、src/panels/scene-tree/。

## 當前任務：GLTF 導入 — 拖放層

### 1. 修改 src/panels/viewport/ViewportPanel.tsx
- 在 onMount 中對 containerRef 綁定 dragover + drop + dragenter + dragleave 事件
- dragover: `e.preventDefault()`, `e.dataTransfer.dropEffect = 'copy'`
- drop: 過濾出 .glb/.gltf 檔案 → 呼叫 `loadGLTFFromFile(file, editor)`
- 導入失敗時 catch error，透過 signal 傳給 ErrorDialog 顯示
- 記得在 onCleanup 中移除事件監聽

### 2. 拖放視覺回饋
- 用 createSignal<boolean> 追蹤 isDragging 狀態
- dragenter: setIsDragging(true)
- dragleave: 只在離開 containerRef 時 setIsDragging(false)（注意子元素冒泡問題，用 e.relatedTarget 判斷）
- drop: setIsDragging(false)
- isDragging 為 true 時，顯示半透明覆蓋層 + 「放開以導入模型」文字

### 3. 錯誤顯示
- 用 createSignal<string | null> 管理 errorMessage 狀態
- catch 到錯誤時 setErrorMessage(error.message)
- 渲染 ErrorDialog，open={errorMessage() !== null}

## 依賴
- `loadGLTFFromFile` 來自 src/utils/gltfLoader.ts（Core agent 建立）
- `ErrorDialog` 來自 src/components/ErrorDialog.tsx（UI agent 建立）
- 如果這些檔案尚未存在，先寫好自己的部分，留好 import 語句，合併後自然接通

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 用 SolidJS 的 onMount/onCleanup 管理 DOM 事件監聽
- 用 createSignal 管理元件狀態
- 不要在 Viewport class 內部處理檔案 I/O，拖放邏輯留在 ViewportPanel 元件層
- 樣式用 inline style，配合現有 CSS 變數 var(--bg-*)

## Git 規則
- 工作分支：feat/gltf-viewport
- commit 訊息格式：`[viewport] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
