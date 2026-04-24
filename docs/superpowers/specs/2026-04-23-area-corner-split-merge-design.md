# Area Corner Split/Merge — Design Spec (#459b)

**Issue**: #459b（split #459 的第二階段）
**Parent**: #459（Wave 3 Area split/merge 系列）
**Date**: 2026-04-23
**Status**: Draft (pending user approval)
**Scope**: Blender 式角落拖曳 split / merge 互動；Phase 1 留下的 vertex topology 上加動態 split/merge 拓樸操作 + corner drag UI

---

## 背景

#459a（Phase 1）砍 Dockview、自建 vertex topology + edge drag resize，行為與 Dockview 對等。#459b（Phase 2）把「Blender 真正核心」補上：從 area 角落拖曳觸發 split（切 area）或 merge（吃掉鄰居），Phase 2 後 workspace layout 才具備完整自由度。

**為何分階段**：一次替換底層 + 加新互動 PR 太大、中途卡住不可 revert。Phase 1 已驗證底層沒問題，Phase 2 只動 UI + 拓樸演算法。

---

## 範圍決策（brainstorm 結論）

| 項目 | 決策 |
|------|------|
| 互動 model | Blender 同款：同一 corner handle、拖曳方向決定 split vs merge |
| Preview 策略 | 動態 preview — 每幀重算 mode（split / merge / invalid），模式會切換 |
| Handle 可見性 | Hover 才顯示（Blender 2.8+ 風格），cursor 靠近 corner hit area 才浮 |
| Split axis 判定 | 首次 > 5px 位移的主軸，鎖到 drag 結束（不 unlock） |
| Split 後 id 歸屬 | 原 areaId 保留成 left/top，新 id 是 right/bottom |
| Merge 語意 | src = 拖曳發起的 area（擴張）；dst = 被拖到的鄰居（消失） |
| Merge stateBag | dst 的 editor type / state 直接丟棄（#460 未來做 state persistence 時補） |
| 非鄰居 / 死區 | drag-invalid，cursor 禁止符號，release = nothing to do |
| Command / Undo | 無 — 沿用 Phase 1 `mutate` + `initialTree` snapshot + Esc cancel |
| Hit area 形狀 | 16×16 正方形，位於 area 內側角落 |
| Hit area 優先 | Edge 4px 中段優先於 corner（corner 實效區 ≈ 12×12，扣掉 edge 覆蓋） |
| Cursor 視覺 | Set C — CSS 原生 cursor + cursor 旁 label badge（「Split ▼」/「Merge →」/「Can't do」） |

---

## 互動 Model

### 方向判定（核心規則）

拖曳中**每幀**只看 cursor 當下落點：
- **Cursor 在 src area 內** → `drag-split`，preview 畫一條假想 split 線
- **Cursor 在 src 的鄰居**（有共享 edge）→ `drag-merge`，preview 把鄰居吃掉
- **Cursor 在非鄰居 / viewport 外 / 交界死角** → `drag-invalid`，不顯示 preview，cursor `not-allowed` + label「Can't do」

Mode 會隨 cursor 位置即時切換（drag-split ↔ drag-merge ↔ drag-invalid）。

### Split axis 判定

首次位移 > 5px 時判定一次：
- `|Δx| > |Δy|` → 垂直切（split 線豎著，cursor.x 當下位置 = split ratio）
- `|Δy| > |Δx|` → 水平切（split 線橫著，cursor.y 當下位置 = split ratio）
- **Axis 鎖定**到 drag 結束。使用者若想換軸：Esc 後重拖（UX 簡單比智能好）

### 4-way corner 的 src 判定

Pointerdown 瞬間 cursor 相對 corner 的象限，該象限的 area 是 src。比「從哪裡 hover 進來」更可靠（遠端 pointer 可能沒 hover phase）。

---

## State machine

```
idle
  ↓ cursor 進 corner 16×16 hit area（且不在 edge 4px 內）
corner-hovered          cursor: crosshair + badge「Drag to split / merge」
  ↓ pointerdown
drag-pending            cursor: crosshair，< 5px 位移
  ↓ 首次位移 > 5px（鎖 axis、進 active）
drag-{split|merge|invalid}  動態切換，preview 隨 cursor 即時重算
  ↓ pointerup
commit | cancel

cancel paths:
  - Esc（任何 active state）
  - drag-pending pointerup（< 5px）
  - drag-invalid pointerup
```

Preview 每次 pointermove 直接 recompute（沿用 Phase 1 pattern，不用 rAF）。

---

## 資料模型擴展

### 新純函式 API（加到 `src/app/areaTree.ts`）

```ts
// Hover 偵測
export function getCornerAt(
  tree: AreaTree,
  x: number, y: number,           // 正規化座標 [0,1]
  containerW: number, containerH: number,
  hitRadiusPx: number = 16,
): { areaId: string; corner: 'tl' | 'tr' | 'bl' | 'br' } | null;

// 鄰居列表（merge 目標候選）
export function getCornerNeighbors(
  tree: AreaTree,
  areaId: string,
  corner: 'tl' | 'tr' | 'bl' | 'br',
): Array<{
  neighborAreaId: string;
  sharedEdgeId: string;
  direction: 'n' | 's' | 'e' | 'w';
}>;

// 拓樸操作（純函式，回傳新 tree）
export function splitArea(
  tree: AreaTree,
  areaId: string,
  axis: 'h' | 'v',
  ratio: number,                  // split 線在 area 內部的正規化位置 [0,1]
  newAreaId: string,              // 呼叫者預先生成 id（for Command undo friendliness，雖然目前不用 Command）
): AreaTree;

export function mergeArea(
  tree: AreaTree,
  srcAreaId: string,
  dstAreaId: string,              // 必須是 src 的鄰居
): AreaTree;

// 可行性判定（UI preview 層即查，決定 drag-invalid）
export function canSplit(
  tree: AreaTree,
  areaId: string,
  axis: 'h' | 'v',
  ratio: number,
  containerW: number,
  containerH: number,
  minPx: number,                  // MIN_AREA_PX = 120
): boolean;

export function canMerge(
  tree: AreaTree,
  srcAreaId: string,
  dstAreaId: string,
): boolean;

// Cursor 當下位置落在哪個 area？（drag-split / drag-merge / drag-invalid 判定）
export function getAreaAt(
  tree: AreaTree,
  x: number, y: number,           // 正規化 [0,1]
): string | null;
```

### 新 signal 型別（`src/app/cornerDragStore.ts`）

```ts
type CornerDragState =
  | { phase: 'idle' }
  | { phase: 'pending'; srcAreaId: string; corner: Corner;
      startX: number; startY: number }
  | { phase: 'active'; srcAreaId: string; corner: Corner;
      mode: 'split' | 'merge' | 'invalid';
      axis?: 'h' | 'v';              // split 時存在
      splitRatio?: number;            // split 時存在
      dstAreaId?: string;             // merge 時存在
      cursorX: number; cursorY: number;
      previewTree?: AreaTree;         // mode='split'/'merge' 時計算好，'invalid' 時 undefined
    };
```

---

## Algorithm 細節

### splitArea(tree, areaId, axis='v', ratio, newAreaId)

**輸入**：`Area A`，要垂直切成 left (原 id) + right (newAreaId)。

1. 找 A 的 4 個 vert：tl, tr, bl, br
2. 在 A 的 **top edge** 上插入新 vert `vTop`（x=ratio × A.width + A.left, y=A.top）；同理 **bottom edge** 上 `vBot`
3. 若 top edge 中段剛好對應鄰居 edge → 該鄰居 edge 在 vTop 處分段成兩條（產生 T-junction，若該鄰居原本是 regular edge；或延伸既有 T-junction topology）
4. 新增 edge `e_split`：vTop → vBot，orientation='v'
5. 原 A 變 left half：verts 變成 `{ tl: A.tl, tr: vTop, bl: A.bl, br: vBot }`
6. 新 area（newAreaId）為 right half：verts 變成 `{ tl: vTop, tr: A.tr, bl: vBot, br: A.br }`
7. 複製 A 的 editor type 給 newAreaId（split 完兩邊同 editor type，使用者事後換）

水平切（axis='h'）邏輯對稱：切 left/right edges，產生 vLeft/vRight、新 edge 'h'、原 A 為 top half、新 area 為 bottom half。

### mergeArea(tree, srcId, dstId)

**前提**：src 和 dst 有共享 edge `eShared`（`canMerge` 先查）。

1. 找 `eShared`：由 `getCornerNeighbors` 對應的共享 edge
2. 計算 src 吃掉 dst 後的邊界：src 的某 edge 擴張到 dst 的對側 edge（例 src 在 left、dst 在 right，共享 vertical edge → src 的 right edge 搬到 dst 的 right edge 位置）
3. 刪除 dst area record
4. 刪除 eShared
5. 更新 src.verts：對應到共享 edge 的兩個 vert 改成 dst 那側的 vert（src.tr = dst.tr, src.br = dst.br 若共享 vertical right edge）
6. 處理 eShared 的兩個端點 vert：
   - 若該 vert 在 merge 後**只剩外框 edge 參與**（degree=2、直線）→ 保留無害（或可選擇收縮，但增加實作複雜度且無 UX 差異；**此 spec 採保留**）
   - 若該 vert 還有別條內部 edge 進來 → 必然保留，成為 T-junction 或 regular intersection
7. 刪除 dst 原本「非共享 edge」中不再被任何 area 引用的 edge / vert（例：dst 內部曾有 split edge、merge 後無用）

**注意**：merge 一次只吃一個 area（非遞迴）。areaTree 是 flat 結構，沒有「sub-tree」語意 — 使用者視覺上看到的複雜 layout 是多個 area 共同組成，每次 merge 吃掉一個鄰居。符合 Blender UX。

### getAreaAt(tree, x, y)

遍歷 tree.areas，用 vert 座標計算矩形 bounding，測 point-in-rect。O(N_areas)，typical N < 10，O(N) 可接受。

---

## 組件結構

### 新組件

**`src/app/layout/AreaCornerHandle.tsx`**
- 每個 area 4 個角落各掛一個 16×16 正方形，`position: absolute`，靠 area 內側
- `z-index` 低於 AreaSplitter（edge 優先接管 4px 中段 hit，corner 實效區 ≈ 12×12）
- `onPointerDown`: 設 cornerDragStore 進 `pending`、`setPointerCapture`、註冊 document-level `pointermove` / `pointerup` / `keydown`
- 渲染：`phase === 'idle'` 時不畫任何 visual；cursor 進入 hit area（hover event 觸發）後 cursor 變形並浮 badge

### 修改

**`src/app/layout/AreaTreeRenderer.tsx`**
- 讀 `cornerDragStore()`，若 `phase === 'active'` 且 `previewTree` 存在 → render `previewTree` 取代 `workspace.grid`
- Mode 是 `invalid` 時 render 原 tree（無 preview）
- 新增 overlay layer：drag-invalid 狀態時 cursor 旁邊 badge label（absolute div，top/left = cursor pos）

**`src/app/workspaceStore.ts`**
- 不動。sync 模式沿用 Phase 1：pointermove 直接 mutate signal（live preview = signal 當下值）
- Phase 2 的 preview 不 mutate workspaceStore，只更 cornerDragStore.previewTree（AreaTreeRenderer 讀 preview 優先）
- Release commit 時才 mutate workspaceStore 一次

### cornerDragStore

新檔 `src/app/cornerDragStore.ts`：
- `createSignal<CornerDragState>({ phase: 'idle' })`
- Export `cornerDragStore`, `setCornerDragStore`

---

## Cursor + Label 視覺（Set C）

CSS 原生 cursor（各 state）：
- `corner-hovered`: `crosshair`
- `drag-split` axis=v: `ew-resize`
- `drag-split` axis=h: `ns-resize`
- `drag-merge`: `move`
- `drag-invalid`: `not-allowed`

Label badge（absolute div 跟 cursor 移動）：
- `corner-hovered`: 不畫 badge（避免常駐 tooltip 擾人；cursor crosshair 已足夠 affordance）
- `drag-split`: 「Split ▼」或「Split ▶」（依 axis）
- `drag-merge`: 「Merge →」（箭頭指向 dst 方向）
- `drag-invalid`: 「Can't do」

Badge style（參 theme.css）：
- 黑底白字、padding 4px 8px、rounded 2px、font-size 11px
- `position: absolute`，偏 cursor 右下 12px / 16px
- `pointer-events: none`（不擋 pointermove）

---

## 資料流 & 生命週期

### Hover

Area 掛 `AreaCornerHandle` × 4。pointermove 進 corner 16×16 hit area 時（且不在 edge 4px 內）→ CSS `:hover` 生效，cursor 變 crosshair，label badge 浮出。

### Pointerdown → pending

- `setPointerCapture`
- `setCornerDragStore({ phase: 'pending', srcAreaId, corner, startX, startY })`
- 記 `initialTree = workspace.grid`（for Esc cancel）

### Pointermove → active

每次 pointermove：
1. 計算 `Δx = e.clientX - startX`, `Δy = e.clientY - startY`
2. 若 `|Δ| < 5px` → 仍 `pending`，不做事
3. 首次 > 5px：鎖 axis = (|Δx| > |Δy|) ? 'v' : 'h'，進 `active`
4. Active phase 每幀：
   - `cursorXNormalized = e.clientX / containerW`, `cursorYNormalized = e.clientY / containerH`
   - `areaAtCursor = getAreaAt(tree, cursorX, cursorY)`
   - 若 `areaAtCursor === srcAreaId`:
     - mode = 'split'; 算 `splitRatio` = axis=v ? cursorX 投影到 src 寬度 [0,1] : cursorY 投影到 src 高度 [0,1]
     - 若 `canSplit(tree, srcId, axis, ratio, ...)` → previewTree = splitArea(...)
     - 否則 → mode = 'invalid'（split 後某側 < 120px）
   - 若 `areaAtCursor` 在 getCornerNeighbors(srcAreaId, corner) 回傳的清單中:
     - mode = 'merge'; dstAreaId = areaAtCursor
     - `canMerge(...)` → previewTree = mergeArea(...)
     - 否則 invalid
   - 其他 → mode = 'invalid'
5. Update cornerDragStore

### Pointerup → commit

- 讀當下 `cornerDragStore.phase.mode`
- `split` / `merge`：`mutate(s => updateCurrentWorkspace(s, { grid: previewTree }))`
- `invalid` / `pending`：不做事（initialTree 本來就是 workspaceStore 當下值）
- 清 listeners、`setCornerDragStore({ phase: 'idle' })`

### Esc → cancel

- `mutate(s => updateCurrentWorkspace(s, { grid: initialTree }))`（phase 1 慣例，保守 rollback；Phase 2 因 preview 沒 mutate workspaceStore，這步其實 no-op，但保留 for safety）
- 清 listeners、set idle

---

## Error handling

| 錯誤 | 處理 |
|------|------|
| pointerdown 時 srcAreaId 不存在（race） | 退出、不進 pending |
| pointermove 算出 splitRatio < 0 或 > 1（cursor 跳出 src） | 直接視為 non-src-area → mode='merge' or 'invalid'（靠 getAreaAt） |
| canSplit 因 min-size fail | mode='invalid'，not-allowed |
| canMerge 因非鄰居 | mode='invalid'，not-allowed |
| splitArea / mergeArea 拋錯（不變量破壞） | console.error + mode='invalid'（保護渲染層） |
| Cursor leave window | 依 setPointerCapture，pointermove 仍傳；但若 pointercancel → 視為 cancel |

---

## 測試

### 純函式 vitest（沿用 Phase 1 `src/app/__tests__/areaTree.test.ts`）

#### `splitArea`
- Blank preset（單 area）切 垂直 / 水平 → 2 area + 1 new edge + 2 new vert
- Default preset 的某個子 area 切 → 正確 T-junction 生成（新 edge 端點在鄰居 edge 中段）
- Split ratio 邊界（接近 0 / 1）→ canSplit false
- Custom-L preset 切 → 保留既有 T-junction、加新 edge

#### `mergeArea`
- Blank preset 不可 merge（canMerge=false）
- Default preset 的兩個鄰居 merge → dst 消失、src 擴張、共享 edge 消失
- Debug preset merge 造成 T-junction 收縮 case → T-junction vert 保留（無害）
- 非鄰居 merge → canMerge false

#### `canSplit` / `canMerge`
- Table-driven：所有 preset × 所有 area × split axis + ratio、merge target pairs
- Min-size boundary：MIN_AREA_PX ± 1 都測

#### `getCornerAt` / `getCornerNeighbors` / `getAreaAt`
- Table-driven：cursor 在 corner、edge 上、area 中心、交界死角各種位置

預計 +40 個 test（Phase 1 已有 32）。

### 手動 QA

Blank / Default / Custom-L / Debug 四個 preset 各測：
1. 從每個角落啟動 drag
2. 拖進 src 內 → split（水平 + 垂直 axis 各一次）
3. 拖進各鄰居 → merge
4. 拖到非鄰居 / viewport 外 → drag-invalid、release 無事
5. 拖曳中 Esc → cancel，layout 不變
6. Debug preset 的 T-junction 從 4-way corner 啟動 split → 正確生成
7. 連續 split 產生 深度 > 3 的 layout，能 merge 回去
8. Min-size boundary：把 area 拖到接近 120px 時 split → drag-invalid

---

## 已知限制（Phase 2 範圍外）

1. **Merge stateBag 丟棄** — dst area 的 editor type 會直接變成 src 的，原 dst 的 editor 內部 state（camera、selection 等）丟失。#460 area state persistence 時再補
2. **不支援跨 workspace 拖動** — 只在當下 workspace 內操作
3. **觸控 gesture** — 桌面優先，觸控支援未驗證（pointer event 應相容，但未測）
4. **Animation transition** — split / merge commit 瞬間切換，無 animation（Blender 也是瞬切）
5. **Split 深度上限** — 無軟限制；但 MIN_AREA_PX 自然限制最深層數（container 多大，就能切幾層）
6. **Merge 遞迴** — 不遞迴吃 dst 的子 split；dst 本身是複雜 sub-layout 時，使用者需先把 dst 內部 merge 乾淨

---

## 實作拆分建議（writing-plans 階段用）

建議拆 3-4 個 sub-issue（參 Phase 1 的 4 個拆法）：

- **#459b-1**：areaTree 新純函式（getCornerAt / getCornerNeighbors / getAreaAt / splitArea / mergeArea / canSplit / canMerge）+ vitest，不動 UI
- **#459b-2**：cornerDragStore signal + AreaCornerHandle component（hit area + pointerdown 觸發 pending）
- **#459b-3**：AreaTreeRenderer 整合 preview（讀 cornerDragStore、active 時 render previewTree）+ state machine 實作（pointermove / pointerup / keydown）
- **#459b-4**：Cursor + label badge overlay 視覺，手動 QA 全 preset

合併 #459b-3 + #459b-4 成 3 個也可（Plan 階段決定）。

---

## Commit message 慣例

所有 commit 用 `[app]` 前綴（與 Wave 1/2/3-Phase 1 一致）。每 PR 結尾帶 `refs #<sub-issue>`。
