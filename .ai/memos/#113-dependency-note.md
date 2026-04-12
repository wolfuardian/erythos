# #113 ProjectPanel Load 適配 — 依賴備忘

## 狀況

實作完成，但 `npm run build` 失敗：

```
src/app/panels/project/ProjectPanel.tsx(197,16): error TS2339:
Property 'loadScene' does not exist on type 'Editor'.
```

## 原因

`editor.loadScene()` 由 issue #111（`feat/autosave-sceneformat`）負責新增到 `Editor.ts`，
該 worktree 目前仍在開發中，尚未開 PR 和 merge。

## 影響

本 PR 的改動本身正確：
- `performLoad` 改用 `JSON.parse(data)` + `editor.loadScene(parsed)` ✓
- 移除 `restoreSnapshot` import ✓

Build 錯誤純粹是依賴缺失，非本 PR 邏輯錯誤。

## 建議

#111 merge 後，本 PR 的 build 即可通過，可直接 QC + merge。
若需在 #111 之前驗證，可先在 master 上 cherry-pick 或等待依賴就緒。
