# Close Project — 設計文件

**狀態：** 待實作
**Mockup：** [.claude/previews/close-project.html](../previews/close-project.html)（方案 B）

---

## 1. 目標

Editor 視圖內提供使用者顯式關閉目前專案、回到 Welcome 介面的入口。底層 `closeProject()` 已實作（見 `src/app/App.tsx:73-95`），本次只補 UI trigger + 專案上下文常駐顯示。

---

## 2. 現況

### 2.1 已就緒
- `App.tsx:73-95` `closeProject()`：flush autosave → off `sceneReplaced` listener → dispose bridge / sharedGrid / editor → `projectManager.close()` → 清 signals → fallback 回 Welcome
- `src/core/project/ProjectManager.ts:122-126` `close()`：清 `_handle` / `_files` + emit
- `Welcome.tsx`：close 後自動透過 `<Show>` fallback 回到此畫面
- `App.tsx:97` `onCleanup` 已接 closeProject（unmount 觸發）

### 2.2 缺口
- 使用者無 UI button 可手動觸發 close
- Editor 視圖（Toolbar / StatusBar）未顯示「目前開哪個專案」

---

## 3. UI 規格（方案 B：Toolbar 開頭專案 chip + dropdown）

### 3.1 Chip 樣式
- 位置：`Erythos` logo 與第一個 `Divider` 之間
- 渲染：`<projectName> ▾`
- 一般態：`background: var(--bg-section)`，`border: 1px solid var(--border-subtle)`
- Hover：`background: var(--bg-hover)`
- Open（dropdown 展開中）：`border: 1px solid var(--accent-blue)`
- 字型 / spacing 沿用既有 `ToolbarBtn` 規格（高度 24px，padding `2px 8px`）

### 3.2 Dropdown
- 觸發：點擊 chip
- 關閉：再次點 chip / 點外部 / Esc
- 透過 SolidJS Portal 渲染（避免被 toolbar overflow 截斷）
- 對齊：相對 chip 左下角，`margin-top: 2px`
- 第一版唯一項目：`Close Project`
- Hover 樣式沿用 `ContextMenu.tsx` 風格

### 3.3 Confirm dialog（autosave error 才出）
- 觸發條件：點 `Close Project` 時 `bridge.autosaveStatus() === 'error'`
- 標題：`Save Failed — Close Anyway?`
- 內文：`Recent changes could not be saved. Closing now will lose them.`
- Confirm 按鈕：`Close Anyway`
- Cancel 按鈕：`Cancel`
- 重用 `src/components/ConfirmDialog.tsx`
- 一般情況（autosaveStatus !== 'error'）不彈 dialog，直接 close（`closeProject` 內部已 `await autosave.flushNow()`）

---

## 4. Component 設計

### 4.1 新增 `src/components/ProjectChip.tsx`
```typescript
interface Props {
  projectName: string;
  autosaveStatus: 'idle' | 'pending' | 'saved' | 'error';
  onCloseProject: () => void;
}
```

職責：
- 渲染 chip + dropdown UI
- 管理 dropdown open state（內部 `createSignal`）
- 偵測 click-outside / Esc 關閉 dropdown
- 處理 autosave error 時的 ConfirmDialog 流程

不負責：
- 實際的 close 邏輯（透過 prop callback 委派）
- 取得專案名稱（由 caller 傳入）

### 4.2 修改 `src/components/Toolbar.tsx`
- 在 `Erythos` 品牌字後插入 `<ProjectChip ... />`
- 從 `useEditor()` 取 `bridge.projectName()` / `bridge.autosaveStatus()` / `bridge.closeProject`

### 4.3 修改 `src/app/bridge.ts`
新增 bridge 欄位：
- `projectName: Accessor<string>` — 訂閱 `projectManager.onChange()`，取 `projectManager.name ?? ''`
- `closeProject: () => void` — caller 注入（App.tsx 把自己的 closeProject 傳進來）

### 4.4 修改 `src/app/App.tsx`
- `createEditorBridge(e, sharedGridObjects, { closeProject, projectManager })` — 把 closeProject + projectManager 傳給 bridge

### 4.5 修改 `src/app/bridge.ts` 簽名
`createEditorBridge(editor, sharedGridObjects, deps)` 接 `{ closeProject, projectManager }`。

---

## 5. Data flow

```
User clicks "Close Project"
  ↓
ProjectChip checks bridge.autosaveStatus()
  ↓                                  ↓
'error' → ConfirmDialog              其他 → 直接呼叫 onCloseProject()
  ↓ (Close Anyway)
onCloseProject()
  ↓
bridge.closeProject  (App.tsx 注入的閉包)
  ↓
App.closeProject()  (現有邏輯)
  ↓
projectOpen=false → <Show> fallback → Welcome
```

---

## 6. 錯誤處理

| 情況 | 處理 |
|------|------|
| autosave 處於 `error` | 彈 ConfirmDialog，使用者選擇 |
| autosave 處於 `pending` | 不擋；`closeProject` 內 `await autosave.flushNow()` 會等完成 |
| `flushNow()` 在 close 過程拋錯 | 沿用既有行為（log + 繼續 dispose）；ConfirmDialog 已是事前防線 |
| Welcome 入口找不到舊 project（permission denied） | Welcome 既有錯誤處理覆蓋；不在本 spec 範圍 |

---

## 7. 測試

### 7.1 Unit
- `ProjectChip.test.tsx`
  - chip 顯示傳入的 projectName
  - 點擊 chip 開 dropdown，再點關閉
  - 點 dropdown 外部關閉
  - Esc 關閉 dropdown
  - 點 `Close Project` 觸發 onCloseProject callback
  - autosaveStatus='error' 時點 `Close Project` 先彈 ConfirmDialog；按 Cancel 不觸發 callback；按 Close Anyway 觸發 callback

### 7.2 Integration
- `App.test.tsx`（若無則新增）
  - openProject → projectChip 顯示 → Toolbar 出現
  - 觸發 closeProject → projectOpen=false → Welcome 重現
  - 重新 openProject 之後 chip 顯示新 projectName

---

## 8. Out of scope（本 spec 不做）

- **Switch Project…**（dropdown 第二個 entry）— **下次處理**，見 §10
- 專案路徑 / id tooltip on chip
- Close Project 快捷鍵
- 多視窗 / 多專案同時開
- chip 顯示 unsaved changes 視覺提示
- 專案重新命名

---

## 9. 模組邊界

| 模組 | 改動 |
|------|------|
| `[components]` | 新增 `ProjectChip.tsx`；修改 `Toolbar.tsx` |
| `[app]` | 修改 `bridge.ts` 加欄位；修改 `App.tsx` 注入 bridge dependencies |
| `[core]` | 無 |

不違反「core/ 不依賴 UI」、「panels/ 只透過 bridge 取狀態」、「viewport/ 不處理檔案 IO」三條契約。

---

## 10. Follow-up（指揮家明示要記得處理）

**Switch Project…** — Close Project 落地後接著做。

預期形式：dropdown 第二個 entry，點擊不會直接 close 而是開 picker（直接重用 Welcome 既有的 Recent Projects 列表 + Open Folder 流程）。實作策略候選兩條，等本 spec 落地後另開設計討論：

- A. dropdown 內 inline 顯示 mini recent list（chip 變成更胖的 popover）
- B. 點擊後 close 目前專案 + 跳回 Welcome（語意上 = Close Project，但動作合一）

A 視覺較完整、B 實作幾乎免費。決定路線時要考慮：是否該允許「不關目前專案就直接切到別的」（涉及 unsaved 風險翻倍）。

---

## 11. 變更紀錄

| 日期 | 內容 |
|------|------|
| 2026-04-28 | 建立設計文件，方案選定 B（Toolbar 開頭 chip + dropdown），第一版只做 Close Project |
