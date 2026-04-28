# numeric-inputs 模組知識庫

_Last updated: 2026-04-21 by EX_
_Module path: src/components/ (NumberDrag, VectorDrag, LadderOverlay)_
_Commit 前綴: [components]_

<!-- EX pull 模式，merge 後不自動刷新，過期請叫 EX 重刷。 -->

## 檔案速覽

| 檔案 | 職責（1 行） |
|------|-------------|
| `NumberDrag.tsx` | 單一數值拖曳 + Houdini-style ladder + arrow 微調 + focus 輸入 + fill bar |
| `LadderOverlay.tsx` | 拖曳時彈出的 tier 選單 popup，Portal 掛 body，pointer-events none |
| `VectorDrag.tsx` | 三欄 NumberDrag 組 XYZ，每欄有色彩 badge（紅/綠/藍）|

## 關鍵 Types / Interfaces

### NumberDragProps
```ts
interface NumberDragProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;          // arrow 微調用，預設 0.1
  min?: number;
  max?: number;
  precision?: number;     // toFixed 位數，預設 2
  onDragStart?: () => void;
  onDragEnd?: () => void;
}
```

### LadderOverlayProps
```ts
interface LadderOverlayProps {
  x: number;             // popup 中心點 viewport X（mousedown 起點）
  y: number;             // popup 中心點 viewport Y（mousedown 起點）
  steps: readonly number[];   // 七個 tier，順序大→小
  activeIndex: number;        // 0-based，目前高亮 tier
  currentValue: string;       // 已 toFixed 好的字串，呼叫方負責格式化
}
```

### VectorDragProps
```ts
interface VectorDragProps {
  values: number[];
  onChange: (index: number, v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  overrides?: AxisOverride[];  // 單軸覆蓋 step/min/max/precision
}
// AxisOverride: { step?, min?, max?, precision? }
```

## NumberDrag 互動 State Machine

### 常數
- `STEPS = [100, 10, 1, 0.1, 0.01, 0.001, 0.0001]`（7 個 tier，index 0=最大）
- `DRAG_SENSITIVITY = 0.3`（accumDx 乘數）
- `TIER_HEIGHT = 28`（px，export 自 LadderOverlay）
- `LADDER_WIDTH = 60`（px，export 自 LadderOverlay，lock zone 閾值來源）
- `PREVIEW_HEIGHT = 36`（px，LadderOverlay 值預覽區塊高度）

### 兩階段拖曳
**Phase 1 — Tier selection（水平 ≤ LADDER_WIDTH/2 = 30px）**
- mousedown 起點記為 `(startX, startY)`；ladder popup 立即出現在起點
- 垂直移動決定 tier：`tierIndex = clamp(3 + round((clientY - startY) / TIER_HEIGHT), 0, 6)`
- 預設 activeIndex = 3（tier = 0.1）
- 水平位移 `|clientX - startX| ≤ 30px` → `locked = false` → 不改值

**Phase 2 — Value drag（水平 > 30px）**
- `|clientX - startX| > LADDER_WIDTH / 2` → `locked = true`
- 進入 locked：`accumDx += me.movementX * DRAG_SENSITIVITY`
- 值計算：`basis + accumDx * STEPS[tierIndex]`，套 min/max clamp
- 離開 lock zone 再進去（或 tier 切換）→ `basis = props.value; accumDx = 0` 重設

### 重設 basis/accumDx 的時機
1. tier 切換（避免 step 突變造成值跳）
2. 由 locked → unlocked（回到中心區）
3. 由 unlocked → locked（重新進入 lock zone）

### 三態背景
- `focused`：`var(--bg-input-focus)`
- `hovered`：`#333648`
- 預設：`var(--bg-subsection)`

### 其他行為
- mousedown 時若 `focused()` → 直接 return（讓 input 正常接收 click）
- mouseup 時若未曾移動（`!localDragging`）→ `inputRef.focus()` 進輸入模式
- focus 進 input → `inputRef.select()` 全選
- fill bar：僅 min 和 max 都有值時顯示；用 `var(--accent-teal)` 填充
- arrow buttons（‹ ›）：hover 且未 focused 且未拖曳時出現，寬 14px，左右絕對定位
- Enter 鍵 → blur → 觸發 handleBlur 提交值
- onCleanup：移除 listener + 還原 `document.body.style.cursor = ''`

## VectorDrag

- 用 `Index` 迴圈（非 `For`）：`<Index each={props.values}>{(val, idx) => ...}</Index>`
- `val` 是 accessor `() => number`，每次渲染讀取最新值而不重建 DOM
- badge 色彩：X=`#c04040`（紅）、Y=`#3a9060`（綠）、Z=`#527fc8`（藍）
- `overrides?.[idx]` 優先於全域 step/min/max/precision

## LadderOverlay

- `Portal mount={document.body}` → 脫離所有 overflow:hidden 容器
- `pointer-events: none` → popup 不攔截滑鼠，NumberDrag 的 window listener 照常處理
- tier stack 垂直置中於起點：`transform: translate(-50%, -<tierStackHalfHeight>px)`
- active tier：`var(--bg-active)` 底色、`var(--text-primary)`、font-weight 600
- adjacent tier：`var(--text-secondary)`
- 其他 tier：`var(--text-muted)`
- 值預覽：分隔線下方，`var(--accent-gold)` 文字，font-size lg，font-weight 600
- `TIER_HEIGHT` 和 `LADDER_WIDTH` 由此檔 export，供 NumberDrag import 使用

## 依賴關係

- `NumberDrag` → `LadderOverlay`（import TIER_HEIGHT、LADDER_WIDTH、LadderOverlay）
- `VectorDrag` → `NumberDrag`
- `TransformDraw` → `VectorDrag`（position/rotation/scale 各一組，onDragEnd 呼叫 `editor.history.sealLast()`）
- `EnvironmentPanel` → `NumberDrag`（intensity 和 rotation，走 SetEnvironmentCommand + sealLast）
- `ViewportPanel` → `NumberDrag`（多個 render effect 參數，有 min/max fill bar）
- `MultiSelectDraw` → 不用 NumberDrag（多選時用 XYZCellReadonly 顯示 readonly）

## 已知地雷

- **為何不用 Pointer Lock**：曾試驗三輪（#471–#475），造成三個 bug：①cursor 隱藏後 LadderOverlay 定位失去基準；②`pointerlockchange` 事件非同步，移動量丟失；③跨 iframe/Portal 的 lock 行為不可預期。最終放棄，改用純 `movementX` 累積方案。

- **為何 listener 用 `window` 不用 `document`**：`window.addEventListener` 確保即使滑鼠滑出 viewport iframe 範圍仍能接收 mousemove/mouseup，`document` 在某些 Dockview 巢狀框架下會斷訊。

- **tier 切換必須重設 basis/accumDx**：若不重設，切換到新 step 後 `basis + accumDx * newStep` 會因 accumDx 殘留而值突跳。重設後從「當前值」重新開始累積，視覺平滑。

- **VectorDrag 用 `Index` 不用 `For`**（#436 教訓）：`For` 對 primitive array 的 diff 演算法以值比較，陣列同位置相同值會重用 DOM 但訂閱不刷新；`Index` 保持位置穩定且 accessor 永遠反映最新值，避免 XYZ 三欄在 batch update 時值錯位。

- **cursor 隱藏 inline style override**（#454）：試圖用 `document.body.style.cursor = 'none'` 隱藏游標時，Dockview 內部樣式優先級高於 body style；解法是在 onCleanup 確保還原 `''`，但拖曳中隱藏游標已放棄（Pointer Lock 廢棄後不再需要）。

- **lock zone 進出重設 basis**：進入 lock zone 和離開 lock zone 都重設，避免「搖搖晃晃邊界」時值快速跳動。副作用是若在邊界來回，不會累積 drift。

- **EnvironmentPanel 走 Command**（與舊 DB 不同）：舊版用 `editor.setEnvironmentSettings()` 不入 history；新版已改用 `SetEnvironmentCommand` + `editor.history.sealLast()`，支援 undo。

- **MultiSelectDraw 不使用 NumberDrag**：多選面板為唯讀，顯示各軸值或 em-dash（MIXED），只用 XYZCellReadonly，不走 VectorDrag。

## 歷史教訓（條列）

- `#436` — SolidJS `For` vs `Index` primitive array remount（`VectorDrag` 改用 Index 的根源）
- `#450` — NumberDrag value 置中對齊，padding 調對稱
- `#452` — NumberDrag onFocus 全選
- `#454` — cursor 隱藏 inline style 被 Dockview 覆蓋
- `#471–#475` — Pointer Lock 三輪失敗，最終放棄
- `#476` — Houdini-style ladder state machine 兩階段實作

## 最近 PR

- #453 fix/autoselect-onfocus — onFocus 全選
- #451 fix/value-center — value 置中對齊
- #447 fix/numberdrag-priority — mousedown 優先級修正
