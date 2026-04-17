# #338 備忘：NDC/raycast 邏輯三重複製

## 觀察

`src/panels/viewport/ViewportPanel.tsx` onDrop 函式中，NDC 座標計算 + raycast y=0 平面的邏輯目前已有三份 inline copy：
- 路徑 1（OS 檔案拖放，L69-85）
- 路徑 2（內部 GLB，L104-117；本 issue 修改）
- 路徑 3（Leaf 拖曳，L134 附近）

## 影響

目前無 bug，但若未來修改計算公式（例如改變 y=0 plane / 加 snapping），需同步修三處。

## 建議（未來 refactor）

可抽 `computeDropPosition(e: DragEvent, containerRef: HTMLDivElement, viewport: Viewport | null): Vec3` 公用函式，放在 `src/viewport/` 或 `src/utils/`。本 issue 不動（scope 外）。
