# Scene Tree 視覺審計報告

審計日期：2026-04-17
Dev server：http://localhost:3000
狀態：靜態程式碼審計（瀏覽器權限未授權，無法取得即時截圖）

## 無法審計的障礙

Playwright MCP `browser_navigate` 工具在本次執行時被拒絕授權，無法啟動瀏覽器進行即時截圖與互動狀態審計。
本報告改以 `SceneTreePanel.tsx` 原始碼對照 `theme.css` token 定義執行靜態分析。
截圖缺失，座標欄位以「N/A（無截圖）」標註。

---

## Row 級問題清單

### Row 1: Header 列（"Scene" 標題行）

座標：N/A（無截圖）
原始碼位置：`SceneTreePanel.tsx` L561–571

**問題**：
- [ ] Header padding 寫死為 `'6px 10px'`，垂直方向未使用 `var(--space-sm)` (4px) 或 `var(--space-md)` (8px) token，水平方向 10px 同樣無對應 token
- [ ] `font-size: var(--font-size-xs)` (9px) 搭配 `text-transform: uppercase` 在工業介面中對比可能偏低，但 `letter-spacing: '0.5px'` 同樣為寫死值，未使用 token
- [ ] `border-bottom: '1px solid var(--border-subtle)'` 正確使用 token，但分隔線 `1px` 寫死（無對應 border-width token，屬輕微問題）

---

### Row 2: 空場景提示列（"Empty scene"）

座標：N/A（無截圖）
原始碼位置：`SceneTreePanel.tsx` L659–668

**問題**：
- [ ] `padding: 'var(--space-xl)'` (16px) 四邊一致，但文字 `font-size: var(--font-size-sm)` (10px) 相對 `--font-size-md` (11px) 降了一級；一般提示文字是否應與節點行字級一致未明確決策

---

### Row 3: TreeNode 一般節點行

座標：N/A（無截圖）
原始碼位置：`SceneTreePanel.tsx` L194–281

**問題**：
- [ ] 行高使用 `height: 'var(--row-height)'` (22px) 正確，但 `padding-left` 以模板字串 `${8 + props.depth * 16}px` 寫死，8px 與 16px 均無對應 token（應為 `var(--space-md)` 與 `var(--space-xl)` 組合，但縮排步進 16px 無 token）
- [ ] 展開/摺疊箭頭 font-size 寫死為 `'8px'`，無對應 token（最近似 `--font-size-xs` 9px 但不等）
- [ ] 展開/摺疊箭頭 width 寫死為 `'14px'`，無對應 token（`--icon-size` 為 16px，此處有意縮小但未說明）
- [ ] 節點名稱文字：未選中時 `color: 'var(--text-secondary)'`，選中後才升為 `'var(--text-primary)'`；**hover 狀態下文字色無獨立升級**（背景變 `--bg-hover` 但文字仍維持 `--text-secondary`），selected/hover 組合狀態文字對比不一致
- [ ] 節點名稱 `overflow: hidden; text-overflow: ellipsis` 正確，但外層 flex 容器無 `min-width: 0`，deep-nested 節點縮排後名稱 span 可能無法正確 truncate（flex 子元素需要 `min-width: 0` 才能觸發 overflow）

---

### Row 4: Type Badge（類型識別標記）

座標：N/A（無截圖）
原始碼位置：`SceneTreePanel.tsx` L254–268

**問題**：
- [ ] `Box`、`Sphere`、`Plane`、`Cylinder` 四種幾何類型 badge 使用 `var(--badge-geometry, #f5a623)` fallback，但 `theme.css` 中**無 `--badge-geometry` 定義**，實際渲染為 hardcode fallback `#f5a623`（橙黃色，不在 token 系統內）
- [ ] badge 寬高寫死為 `'16px'`，與 `--icon-size: 16px` 數值相同但未引用 token
- [ ] badge `margin-right: var(--space-sm)` 正確
- [ ] `Box` 與 `Cylinder` 的 label 分別為 `'B'` 和 `'C'`，但 `PerspectiveCamera` 的 label 也是 `'C'`；兩個不同類型共用同一字母，在樹狀清單中可能造成混淆（視覺辨識問題）

---

### Row 5: Drop Indicator 拖曳指示線

座標：N/A（無截圖）
原始碼位置：`SceneTreePanel.tsx` L208–231

**問題**：
- [ ] before/after 指示線背景使用 `var(--accent-primary, #4a9eff)` fallback，`theme.css` 中**無 `--accent-primary` 定義**，實際渲染為 hardcode fallback `#4a9eff`
- [ ] "inside" 的 drop target 背景使用 `var(--bg-drop-target, rgba(74, 158, 255, 0.15))` fallback，`theme.css` 中**無 `--bg-drop-target` 定義**，實際渲染為 hardcode fallback
- [ ] 指示線 `height: '2px'` 寫死，無對應 token

---

### Row 6: File Drag 覆蓋層（"Drop GLB to import"）

座標：N/A（無截圖）
原始碼位置：`SceneTreePanel.tsx` L679–694

**問題**：
- [ ] `background: 'rgba(100, 149, 237, 0.15)'` 完全寫死，無 token
- [ ] `border: '2px dashed rgba(100, 149, 237, 0.6)'` 完全寫死，無 token（accent 色與 drop indicator 不一致：這裡用 `rgba(100,149,237)` ≈ cornflowerblue，drop indicator 用 `#4a9eff`，兩者為不同藍色）
- [ ] `color: 'var(--text-secondary, #aaa)'` fallback `#aaa` 不是標準 token 值（`--text-secondary` 定義為 `#9c9c9c`，fallback 值不一致）
- [ ] `font-size: '13px'` 寫死，無對應 token（`--font-size-lg` 為 12px，`--font-size-xl` 為 14px，13px 在兩者之間）
- [ ] `border-radius: '4px'` 寫死，應使用 `var(--radius-md)` (4px 但無 token 引用)

---

## 跨 Row 一致性問題

- [ ] **hover 文字色不升級**：節點行 hover 狀態下背景由 transparent 升為 `--bg-hover`，但 name span 的 color 在 hover 時仍維持 `--text-secondary`；selected 狀態才升為 `--text-primary`。hover 與 selected 的文字視覺差異不對稱
- [ ] **多個 `--accent-*` fallback 指向非 token 色**：drop indicator、file drag overlay 都使用了藍色系但互不一致，`#4a9eff` vs `rgba(100,149,237,x)` 是不同色，跨 row 藍色語意不統一
- [ ] **Badge 字母衝突**：`Cylinder` 和 `PerspectiveCamera` 同為 `'C'`，`Box` badge 為 `'B'` 但無對應 geometry 類別在 type 系統中明確區分；若樹中同時存在 Camera 和 Cylinder，無法靠 badge 區分
- [ ] **幾何節點 badge 不在 token 系統內**：Box/Sphere/Plane/Cylinder 四類節點 badge 顏色為唯一使用 fallback-only 的類型，其他節點（Group/Mesh/Light/Camera）均有 token 定義
- [ ] **縮排步進無 token**：depth * 16px 是設計常數，但未存入 token，若全域間距調整不會自動跟隨

---

## 與專案 token 的落差

| 位置 | 使用值 | 應有 token | 狀態 |
|------|--------|-----------|------|
| Header padding | `6px 10px` | 無對應 token | 寫死 |
| Header letter-spacing | `0.5px` | 無對應 token | 寫死 |
| TreeNode padding-left | `${8 + depth * 16}px` | `var(--space-md)` + 縮排倍數無 token | 部分寫死 |
| 展開箭頭 font-size | `8px` | 最近似 `--font-size-xs`(9px) 但不符 | 寫死 |
| 展開箭頭 width | `14px` | 最近似 `--icon-size`(16px) 但不符 | 寫死 |
| Badge 寬高 | `16px` | `var(--icon-size)` | 寫死（值相同但未引用） |
| `--badge-geometry` | fallback `#f5a623` | 無此 token，需新增 | **缺 token** |
| Drop indicator 背景 | `var(--accent-primary, #4a9eff)` | 無 `--accent-primary`，需新增 | **缺 token** |
| Drop target bg | `var(--bg-drop-target, rgba...)` | 無 `--bg-drop-target`，需新增 | **缺 token** |
| Drop indicator height | `2px` | 無對應 token | 寫死 |
| File drag overlay bg | `rgba(100, 149, 237, 0.15)` | 無 token | 寫死 |
| File drag overlay border | `2px dashed rgba(100, 149, 237, 0.6)` | 無 token | 寫死 |
| File drag overlay color fallback | `#aaa` | `--text-secondary` 值為 `#9c9c9c` | fallback 值不一致 |
| File drag overlay font-size | `13px` | 無對應 token（介於 lg:12px 和 xl:14px 之間） | 寫死 |
| File drag overlay border-radius | `4px` | `var(--radius-md)` | 寫死（值相同但未引用） |
