# Wave 1: Area / Editor 重構 — 設計文件

**日期**: 2026-04-21
**範圍**: 砍 Dockview tab bar，改 Blender-like 架構第一階段
**後續 Wave**: #458（頂層 Workspace tabs）、#459（Area split/merge）、#460（Area-level state persist）

---

## 1. 術語與層級

完整 UI 層級（對齊 Blender）：

```
Workspace（頂層 tabs：Layout / Modeling / ... ）          ← Wave 2（#458）
 └─ Area（可 split / merge 的矩形區塊）                    ← Wave 3 做 split/merge（#459）
      └─ Editor（header dropdown 切類型）                   ← 本 Wave 處理
           └─ Panel（FoldableSection：OBJECT / TRANSFORM）
                └─ SubPanel（巢狀 FoldableSection）
                     └─ Property（widget，未來做型別系統）
```

對應目前 code：

| 層 | 現況 | Wave 1 後 |
|----|------|----------|
| Workspace | 無 | 無（Wave 2） |
| Area | Dockview Group + tab bar，可 stack 多 Editor | Dockview Group（隱藏 tab、禁 stack），= 1 Editor |
| Editor | Dockview Panel（scene-tree / properties / ...） | 同上；切換透過 Area header dropdown |
| Panel | `FoldableSection` | 不變 |
| SubPanel | 巢狀 `FoldableSection` | 不變 |
| Property | NumberDrag / VectorDrag / ... | 不變（未來型別系統） |

---

## 2. 本 Wave 範圍

### 要做

- 每個 Area 強制 1 Editor（禁 stacking）
- Dockview tab bar 隱藏
- 自幹 Area header：左側沿用 `PanelHeader` 的灰色 uppercase 標題，右側加 **v2 Blender 複刻** 風格的 Editor switcher dropdown（2×2 格子圖示按鈕 + 三欄分類下拉面板）
- Editor registry 機制：每個 panel 自宣告 `editorDef`，`src/app/editors.ts` 彙總
- 新 Area 資料模型 `{ id, editorType }`
- 清除舊 localStorage layout，改 `erythos-layout-v2` key

### 不做（留後續 Wave）

- Header 拖曳（整個 Wave 1 **無拖曳**）
- 頂層 Workspace tabs（#458）
- Area split / merge（#459）
- Area-level Editor state persist 切走即重置（#460）
- Property 型別系統（未來）
- Icon 美化（本 Wave 先 text label，無 icon）

---

## 3. 檔案結構整併（前置）

現況 panel 分散兩處：

```
src/panels/         ← viewport, scene-tree, properties, leaf, environment
src/app/panels/     ← project, context, settings
```

Wave 1 前置 PR 把 `src/app/panels/*` 搬到 `src/panels/*`，`src/app/panels/` 目錄消失。

---

## 4. Editor Registry

每個 panel 新增 `index.ts`：

```ts
// src/panels/viewport/index.ts
import { ViewportPanel } from './ViewportPanel';

export const editorDef: EditorDef = {
  id: 'viewport',
  label: 'Viewport',
  category: 'Scene',
  component: ViewportPanel,
};
```

彙總：

```ts
// src/app/editors.ts
import { editorDef as viewportDef } from '../panels/viewport';
// ... 其餘 7 個

export const editors: readonly EditorDef[] = [
  viewportDef, sceneTreeDef, propertiesDef,
  leafDef, environmentDef, projectDef, contextDef, settingsDef,
];
```

型別：

```ts
// src/app/types.ts
export interface EditorDef {
  id: string;
  label: string;
  category: 'Scene' | 'Object' | 'App';
  component: Component;
}
```

分類（Wave 1 初版）：

- **Scene**: Viewport / Scene Tree / Leaf / Environment
- **Object**: Properties / Context
- **App**: Project / Settings

---

## 5. Area 資料模型

```ts
// src/app/types.ts
export interface Area {
  id: string;          // UUID，穩定跨 layout 存檔
  editorType: string;  // EditorDef['id']
}
```

Wave 1 不放其他欄位。Wave #460 會擴張 `editorStates`。

---

## 6. Area Header UI

沿用 `PanelHeader`，右側 `actions` slot 塞 `EditorSwitcher` 元件：

```tsx
<PanelHeader
  title={currentEditorDef.label.toUpperCase()}
  actions={<EditorSwitcher
    currentId={area.editorType}
    onSelect={(nextId) => setAreaEditor(area.id, nextId)}
  />}
/>
```

`EditorSwitcher` 依 v2 mockup（`.claude/previews/editor-switcher-v1.html`）：

- 按鈕：2×2 格子圖示 + 右側 caret，小尺寸 fit header 高度
- Dropdown：三欄（Scene / Object / App），hover highlight，當前項藍色 active
- 點選即觸發 `onSelect` → Area editorType 改變 → Editor 元件 unmount/mount 新類型（符合懶加載）

---

## 7. Dockview 配置

Wave 1 保留 Dockview 作為 split grid 地基（Wave 3 才真正砍掉）。

改動：

- **隱藏 tab bar**：實作時驗證 Dockview 是否有 `hideHeader` option，否則 CSS override `.dv-tabs-container { display: none }`
- **禁 stacking**：`disableDnd: true` 停用所有原生拖放
- **初始 layout**：`defaultLayout` 硬寫 3 Area（scene-tree 左 / viewport 中 / properties 右），每 Area 1 Editor

---

## 8. FoldableSection localStorage 修復（前置）

**風險**：目前 key 是語意字串（`"object"` / `"transform"`），兩個 PropertiesPanel instance 同時存在會互搶 key，折疊狀態互相覆寫。

**修法**：FoldableSection API 新增 `scope` prop，key 格式變 `erythos.foldable.<scope>.<sectionKey>`：

```tsx
<FoldableSection scope={areaId} sectionKey="transform" ... />
```

Wave 1 透過 Context 從 Area 層往下傳 areaId。Wave 1 之前的 PR 先讓 API 接受 `scope`（暫時硬寫 `'default'`），Wave 1 主 PR 才接 Area context。

---

## 9. Migration

清掉 `localStorage['erythos-layout-v1']`，用新 key `erythos-layout-v2`。使用者（= 指揮家）啟動即重置為新 default layout。

新 key 的序列化格式：

```ts
interface SavedLayout {
  version: 2;
  areas: Area[];           // 扁平陣列
  grid: DockviewLayout;    // Dockview 原生 JSON（用於 split 位置）
}
```

---

## 10. PR 順序與依賴

| PR | 內容 | 依賴 | 可並行 |
|----|------|------|-------|
| #461 | `src/app/panels/*` → `src/panels/*` 檔案搬 | 無 | 與 #462 並行 |
| #462 | `FoldableSection` 加 `scope` prop（預設 `'default'`），localStorage key 改格式 | 無 | 與 #461 並行 |
| #463 | 每 panel 建 `index.ts` export `editorDef`，建 `src/app/editors.ts` 與 `EditorDef` 型別 | #461 | — |
| #464 | `EditorSwitcher` 元件（依 v2 mockup），Area 資料模型，Dockview 隱藏 tab + 禁 DnD | #463 + #462 | — |
| #465 | 新 `defaultLayout`（3 Area，新 localStorage key），刪舊 panel stacking 邏輯 | #464 | — |

---

## 11. 驗收

- 啟動後看到 3 Area（scene-tree / viewport / properties），無 tab bar
- 每 Area 右上角有 2×2 格子 + caret dropdown，點開三欄分類
- 切換 Editor 即時替換，無動畫
- 兩 Area 同時選 `Properties` 時：折疊狀態獨立（因為 FoldableSection scope 依 areaId）
- 重整頁面後 layout 保留（新 key 有效）
- `npm run build` 過

---

## 12. 已確認決策清單

| 項目 | 決策 |
|------|------|
| Workspace 層 | 本 Wave 不做，Issue #458 |
| Area split/merge | 本 Wave 不做，Issue #459 |
| Area-level state persist | 本 Wave 不做（切走即重置），Issue #460 |
| Header 拖曳 | 本 Wave 不做，併入 #459 一起處理 |
| Property 型別系統 | 本 Wave 不做，無 issue（未來再開） |
| Editor registry 位置 | (b) 每 panel 自宣告，app 彙總 |
| 初始 layout | 3 Area：scene-tree / viewport / properties |
| localStorage migration | 清掉舊的，不寫 migration |
| panel 目錄整併 | 全部搬到 `src/panels/*` |
| ContextPanel 存留 | 保留並列入 switcher（非 dev-only） |
| Editor switcher UI | v2 Blender 複刻（2×2 格子圖示 + 三欄分類） |

---

## 13. 參考

- Mockup: `.claude/previews/editor-switcher-v1.html`
- 相關 issue: #458、#459、#460
- Brainstorm 對話: 2026-04-21
