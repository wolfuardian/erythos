# Properties Module Cache

_Last updated: 2026-04-17 by RDM_
_Module path: src/panels/properties/_
_Commit 前綴: [properties]_

## 檔案速覽

| 檔案 | 職責（1 行） |
|------|-------------|
| `PropertiesPanel.tsx` | 頂層面板：Switch/Match 分派單選 / 多選 / 空選 |
| `index.ts` | 只 re-export `PropertiesPanel` |
| `object/ObjectDraw.tsx` | 單選：OBJECT section（Name 可編輯、Type 唯讀） |
| `object/TransformDraw.tsx` | 單選：TRANSFORM section（Position/Rotation/Scale 可編輯）+ 嵌套 DELTA TRANSFORM 子 section（目前 hardcoded 0） |
| `object/MultiSelectDraw.tsx` | 多選：OBJECT + TRANSFORM section（全唯讀，差異顯示 em-dash） |
| `components/FoldableSection.tsx` | 可折疊分組容器，折疊狀態持久化到 localStorage |
| `components/XYZCell.tsx` | XYZ 三欄輸入元件，含可編輯（`XYZCellEditable`）與唯讀（`XYZCellReadonly`）兩版 |
| `components/fieldStyles.ts` | 共用 style 物件（Variant A Tint v2） |

## 關鍵 Types / Interfaces

- `FoldableSectionProps`：`{ sectionKey: string; label: string; children: JSX.Element; variant?: 'default' | 'deep' }`
  - `variant="deep"` 使 body 背景 `color-mix(in srgb, var(--bg-section) 70%, var(--bg-app) 30%)`
- `XYZCellEditableProps`：`{ axis: XYZAxis; value: number; onChange: (v: number) => void }`
- `XYZCellReadonlyProps`：`{ axis: XYZAxis; value: string }` — value 為字串，支援 MIXED em-dash
- `ObjectDrawProps` / `TransformDrawProps` / `MultiSelectDrawProps`：均只含 `uuid: string` 或 `uuids: string[]`

## 常用 Pattern

- **FoldableSection 折疊持久化**：key 格式 `erythos.properties.foldable.<sectionKey>`，存 localStorage，預設展開（#374）
- **單選/多選同步折疊狀態**：ObjectDraw 與 MultiSelectDraw 共用相同 `sectionKey`（"object"/"transform"），折疊狀態保持同步
- **Delta Transform 子 section**：`TransformDraw` 用 `variant="deep"` 嵌套第二層 `FoldableSection`（#376）；目前值 hardcoded 0，待階段 2 替換
- **row 層級 padding-left**：`fieldRow` 與 `groupLabelRow` 各自帶 `padding-left: 14px`，不在 FoldableSection body wrapper 設置（#378）
- **XYZ badge 顏色**：X=`--accent-red`、Y=`--accent-green`、Z=`--accent-blue`
- **focus 防跳動**：XYZCellEditable 用 `border-bottom: 2px solid transparent` 佔位，聚焦時改色，避免 1→2px 高度跳動

## 跨檔依賴

- `PropertiesPanel` → `ObjectDraw` + `TransformDraw` + `MultiSelectDraw`
- `ObjectDraw` + `TransformDraw` + `MultiSelectDraw` → `FoldableSection` + `fieldStyles.ts`
- `TransformDraw` + `MultiSelectDraw` → `XYZCell`（`XYZCellEditable` / `XYZCellReadonly`）
- `ObjectDraw` → `core/commands/SetNodePropertyCommand` + `core/scene/inferNodeType`
- `TransformDraw` → `core/commands/SetTransformCommand` + `core/scene/SceneFormat`（Vec3）

## 已知地雷

- **Delta Transform 值 hardcoded**：`TransformDraw` 內 Delta Transform 子 section 全部顯示 `"0"`，屬計畫內暫態，待功能完整後替換為真實 delta 計算（#376 說明）
- **MultiSelectDraw 無編輯能力**：多選時所有欄位唯讀；需要多選批次編輯需另開 issue
- **FoldableSection 無 variant 傳遞**：MultiSelectDraw 的 TRANSFORM 並不傳 `variant`，深層嵌套若要加 deep tint 需手動補 prop

## 最近 PR

- #374 Variant A Tint v2 視覺落地（新增 `FoldableSection` / `XYZCell` / `fieldStyles.ts`，改寫 3 Draw + PropertiesPanel）
- #376 追加 Delta Transform 子面板（`FoldableSection` 加 `variant="deep"` prop）
- #378 padding-left 從 FoldableSection body wrapper 移至 row 層級（`fieldRow` + `groupLabelRow` 加 `padding-left: 14px`）
