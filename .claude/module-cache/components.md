# Components 前置知識

_Last updated: 2026-04-25 by EX_
_Module path: src/components/_
_Commit 前綴: [components]_

## 檔案速覽

| 檔案 | 職責（1 行） |
|------|-------------|
| `ConfirmDialog.tsx` | 全域確認對話框，雙按鈕（Confirm / Cancel），Backdrop click = cancel |
| `ContextMenu.tsx` | 右鍵選單，支援無限深度巢狀子選單，含 flip 防邊界溢出 |
| `EditorSwitcher.tsx` | PanelHeader 右側切換面板類型的下拉選單（Portal 渲染，3 欄 grid） |
| `ErrorDialog.tsx` | 單按鈕錯誤對話框（Close only），通用；不得寫死 GLTF 字樣 |
| `LadderOverlay.tsx` | NumberDrag 拖曳中顯示的 step tier popup（Portal，pointer-events:none） |
| `NumberDrag.tsx` | 數字輸入 + 橫向拖曳變更值，拖曳中顯示 LadderOverlay |
| `PanelHeader.tsx` | 面板頂部標題列，固定高 24px，含 EditorSwitcher（透過 useArea） |
| `Toolbar.tsx` | 應用頂部工具列，含 import/save/load/add 物件/transform 模式切換 |
| `VectorDrag.tsx` | X/Y/Z 三欄彩色 badge + NumberDrag 的組合輸入元件 |

## 關鍵 Types / Interfaces

- `ConfirmDialogProps`：`{ open, title, message, onConfirm, onCancel, confirmLabel?, cancelLabel? }`
  - confirmLabel/cancelLabel 預設 'OK'/'Cancel'；目前無 `variant` prop（#345 尚未實作 danger 樣式）
- `ErrorDialogProps`：`{ open, title, message, onClose }`
- `ContextMenuProps`：`{ items: MenuItem[], position: {x,y}, onClose, align?: {itemIndex, xPercent} }`
  - `MenuItem`：`{ label, action?, children?: MenuItem[], disabled? }`；子選單無限巢狀
  - `align`：對齊指定 item 的 xPercent 位置，供「右鍵在 item 上」的精準定位
- `NumberDragProps`：`{ value, onChange, step?, min?, max?, precision?, onDragStart?, onDragEnd? }`
  - `precision` 預設 2；`min`/`max` 不填則不 clamp
  - 填了 `min`+`max` 才顯示底部 fill bar（accent-teal）
- `VectorDragProps`：`{ values: number[], onChange(index,v), step?, min?, max?, precision?, onDragStart?, onDragEnd?, overrides?: AxisOverride[] }`
  - `overrides[i]` 可單軸覆蓋 step/min/max/precision；values 超過 3 個時 badge 顯示 index 數字
- `LadderOverlayProps`：`{ x, y, steps: readonly number[], activeIndex, currentValue: string }`
  - 匯出常數：`TIER_HEIGHT=28`、`LADDER_WIDTH=60`；由 NumberDrag 直接引用
- `PanelHeaderProps`：`{ title, actions?: JSX.Element }`
  - 自動從 `useArea()` 取得 context → 渲染 EditorSwitcher；若 area 為 null 則不渲染 switcher
- `EditorSwitcherProps`：`{ editors: readonly EditorDef[], currentId, onSelect }`
  - 分三欄 categories（Scene / Object / App），圖示定義在內部 `EditorIcon`（id-based switch）
  - shortcuts 硬編碼於 `SHORTCUT_MAP`（Shift+F1~F8）

## 常用 Pattern

- **Dialog keydown 清理**：ConfirmDialog / ErrorDialog 均以 `createEffect(() => { if (!open) return; ... onCleanup(...) })` 動態綁定 Escape，避免 closed 時殘留 listener
- **ContextMenu setTimeout(0)**：click-outside listener 延一 tick 綁定，防 contextmenu event 後接 click 立即關閉選單
- **LadderOverlay Portal**：掛在 `document.body`，`pointer-events:none`；所有 mouse 事件由 NumberDrag 的 window listener 處理
- **EditorSwitcher 兩段渲染**：先以 `visibility:hidden` 掛 Portal 讓 DOM 渲染，`requestAnimationFrame` 量測後設 `visibility:visible` + 精確座標，防閃爍
- **VectorDrag uses Index**：用 `<Index>` 而非 `<For>`，保持各軸 DOM identity 穩定

## 跨檔依賴

- `NumberDrag` → `LadderOverlay`（直接 import）
- `VectorDrag` → `NumberDrag`
- `PanelHeader` → `EditorSwitcher`（固定嵌入）
- `PanelHeader` → `useArea`（app/AreaContext）、`editors`（app/editors）
- `Toolbar` → `ErrorDialog`、`loadGLTFFromFile`（utils）、`useEditor`（app/EditorContext）、`AddNodeCommand`（core）
- 呼叫方：panels 大量引入 `PanelHeader`；`ContextMenu` 被 scene-tree 用；`NumberDrag`/`VectorDrag` 被 properties/viewport 用；`ConfirmDialog`/`ErrorDialog` 被 project/viewport 用

## 已知地雷

- **ConfirmDialog 無 danger variant**：按鈕顏色固定 accent-blue，#345 的 TODO 仍未落地；AD 不得假設 `variant='danger'` prop 存在
- **全域 listener 綁定位置**：`EditorSwitcher` 的 `pointerdown` 在元件 body 層直接 `document.addEventListener`（非 createEffect 包裹），依 CLAUDE.md 慣例這屬例外；實際已有 `onCleanup` 清理，但注意此非標準寫法
- **NumberDrag 硬編碼 hover 色**：`hovered()` 狀態下背景為 `#333648`（非 CSS 變數），與其他元件用 `var(--bg-hover)` 不一致
- **ContextMenu 子選單 flip**：`shouldFlip()` 每次 render 呼叫 `rowRef.getBoundingClientRect()`，在子選單很深時可能多次重排
- **SolidJS `<Show>` 陷阱**：ConfirmDialog/ErrorDialog 均用 `<Show when={props.open}>`；DOM 完全卸載再掛，傳入的 callback ref 不可依賴跨渲染保留

## 最近 PR（選填）

- #596 spec §4.2 Solid 燈光永遠開（不開 checkbox）
- #594 per-mode sceneLights override + sub-panel state 持久化
- #592 shading lookdev HDR
