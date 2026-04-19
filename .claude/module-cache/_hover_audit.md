# Hover 實作模式盤點

_Last updated: 2026-04-18 by EX_
_Scope: scene-tree / properties / viewport-shading-tab / environment / leaf / context-menu / project-hub + settings_

## 盤點結果

| Panel | 路徑 | 實作 | 選擇器 / 機制 | 備註 |
|-------|------|------|--------------|------|
| scene-tree | `src/panels/scene-tree/SceneTreePanel.tsx:169` | (a) | `isHovered()` signal → `rowBackground()` 回傳 `var(--bg-hover)` | 透過 `editor.selection.hover()` + bridge signal 驅動 |
| properties | `src/panels/properties/` | (c) | 無 hover rule | PropertiesPanel.tsx 及所有 sub-components 無任何 hover 相關程式碼 |
| viewport shading tab | `src/panels/viewport/ViewportPanel.tsx:468–486` | (c) | 無 hover rule | `<button>` inline style 只處理 active 狀態（`rgba(255,255,255,0.18)`），無 onMouseEnter / :hover |
| environment | `src/panels/environment/EnvironmentPanel.tsx` | (c) | 無 hover rule | 全檔無 hover 相關程式碼 |
| leaf | `src/panels/leaf/LeafPanel.tsx` | (c) | 無 hover rule | 全檔無 hover 相關程式碼 |
| context-menu | `src/components/ContextMenu.tsx:73–80` | (a) | `onMouseEnter` → `style.background = 'var(--bg-hover)'` | 動態設定 style，onMouseLeave 還原 transparent |
| project-hub | `src/app/panels/project/ProjectPanel.tsx:509–529` | mixed | `hoveredFilter` signal → icon stroke 改 `var(--text-primary)` | 只改 icon 顏色，**無 background hover**；project 卡片、asset 列表無 hover |
| settings | `src/app/panels/settings/SettingsPanel.tsx` | (c) | 無 hover rule | 全檔無 hover 相關程式碼 |

## 結論

- 分佈：a=2（scene-tree、context-menu），b=0，c=5（properties、viewport-tab、environment、leaf、settings）；project-hub 為 mixed（顏色有動但無 bg）
- 傾向：**mostly (c)** — 大多數 panel 完全無 hover 回饋
- 異常點：
  - scene-tree 實作最完整（bridge signal 驅動 var(--bg-hover)）
  - context-menu 用 onMouseEnter 動態寫 inline style（var(--bg-hover)），非 CSS class
  - project-hub 有 hover signal 但只用於 icon stroke 顏色，背景完全沒動

## 自我驗證

1. **scene-tree (a)**：`SceneTreePanel.tsx:169` `if (isHovered()) return 'var(--bg-hover)'` — Grep 確認存在
2. **context-menu (a)**：`ContextMenu.tsx:75` `style.background = 'var(--bg-hover)'` — Read offset 65 確認
3. **properties (c)**：`src/panels/properties/` Grep pattern=`hover` → No matches — 確認全目錄無 hover
