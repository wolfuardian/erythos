# Components 模組（UI 元件）

## 範圍限制
只能修改 src/components/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/panels/、src/app/。

## 當前任務：GLTF 導入 — UI 層

### 1. 建立 src/components/ErrorDialog.tsx
- 通用錯誤對話框元件，不綁定 GLTF 邏輯
- Props 介面：
  ```typescript
  interface ErrorDialogProps {
    open: boolean;
    title: string;
    message: string;
    onClose: () => void;
  }
  ```
- 用 SolidJS 的 `<Show when={props.open}>` 控制顯示
- 結構：半透明背景遮罩 → 居中白色卡片 → 標題(h3) → 訊息(p) → 關閉按鈕
- 點擊遮罩或按 Escape 也能關閉（用 onKeyDown 監聽）
- 樣式用 inline style，配合現有 CSS 變數 var(--bg-panel), var(--text-primary) 等
- 遮罩: position fixed, inset 0, background rgba(0,0,0,0.5), z-index 1000
- 卡片: max-width 400px, padding, border-radius

### 2. 修改 src/components/Toolbar.tsx
- 加一個「Import」按鈕（與現有 ToolbarBtn 風格一致）
- 點擊後建立隱藏 `<input type="file" accept=".glb,.gltf">`，觸發 click
- 選檔後呼叫 `loadGLTFFromFile(file, editor)`
- 用 createSignal 管理 loading 狀態和 error 狀態
- 失敗時顯示 ErrorDialog（title: "導入失敗", message: error.message）
- 按鈕位置：放在現有幾何體按鈕群之後，視覺上用分隔線隔開

## 依賴
- `loadGLTFFromFile` 來自 src/utils/gltfLoader.ts（Core agent 建立）
- 如果該檔案尚未存在，先寫好自己的部分，留好 import 語句

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循 Toolbar.tsx 現有的元件風格和按鈕寫法
- 用 createSignal 管理元件內部狀態
- ErrorDialog 是通用元件：不要在裡面寫死任何 GLTF 字樣
- 匯出 ErrorDialog 讓其他模組也能用

## Git 規則
- 工作分支：feat/gltf-ui
- commit 訊息格式：`[ui] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->
- [ ] ErrorDialog 改為 named export `export { ErrorDialog }`（#3）
- [ ] ErrorDialog Escape listener 改用 `createEffect` 監聽 `props.open`（#4）

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
