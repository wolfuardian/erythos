# Chain Complete — 2026-05-04

延伸 `health-2026-05-04.md` + `complexity-2026-05-04.md` 的 chain 全 7 PRs 完成。

## PR 結果

| PR | Issue | 主題 | 規模 | 路徑 |
|---|---|---|---|---|
| #712 | #706 | PanelHeader 解循環依賴（EditorContext 注入 editors） | 3 檔 / +27/-6 | AH 直做 + QC PASS |
| #713 | #707 | extract ProjectTypeIcon component | 2 檔 / +18/-14 | AH 直做 + QC PASS |
| #714 | #711 | decouple Editor↔AutoSave (createAutoSave factory) | 7 檔 / +64/-54 | AD + QC PASS |
| #715 | #705 | extract projectSession.ts from App.tsx | 2 檔 / +51/-28 | AH 直做 + QC PASS |
| #716 | #708 | extract buildProjectMenuItems pure function | 2 檔 / +81/-49 | AD + QC PASS |
| #717 | #710 | split RenderSettingsPanel + ShadingToolbar from ViewportPanel | 3 檔 / +532/-454 | AD + QC PASS |
| #718 | #709 | extract useNewSceneFlow + useDeleteFlow hooks | 3 檔 / +148/-84 | AD + QC PASS |
| #720 | #719 | split TreeNode + extract sceneTreeMenuItems | 3 檔 / +612/-554 | AD + QC PASS |
| #722 | #721 | extract NewProjectModal from Welcome.tsx | 2 檔 / +255/-230 | AD + QC PASS（順帶修一個既有 errorMsg leak bug） |

P2 (#702 SceneTreePanel) 原計畫延後 — 後確認 #702 已 closed (2026-05-01) + P3/P4 future issues 未排程，啟動處理（#719）。

## 健康指標 delta（before → after）

| 指標 | 原 (2026-05-04 health) | 現 (chain 後) | 變動 |
|---|---:|---:|---|
| 循環依賴 | 3 | 1 | -2 ✓（Editor↔Command 為契約核心，留） |
| ViewportPanel.tsx | 1061 行 | 643 行 | -39% |
| ProjectPanel.tsx | 809 行 | 692 行 | -14% |
| SceneTreePanel.tsx | 840 行 | 396 行 | -53% |
| App.tsx | 249 行 | 大致相同 + 拆出 projectSession 38 行 | 重組 |
| Welcome.tsx | 608 行 | 386 行 | -36%（額外，原本 chain 不在內） |
| 總檔案數 | 126 | 136 | +10（新 component / hook / pure function） |
| 總 LOC | 16,782 | 17,097 | +315（boilerplate cost） |
| Health hotspot top 1 | ViewportPanel 1061 | areaTree.ts 803（未動，現升頂）| 全 P0/P1/P2 退出 top；Welcome 也退出 |

## 新增檔案

- `src/app/projectSession.ts`（#715）
- `src/core/scene/AutoSave.ts` 改 factory（#714，非新檔）
- `src/panels/project/ProjectTypeIcon.tsx`（#713）
- `src/panels/project/projectMenuItems.ts`（#716）
- `src/panels/project/useNewSceneFlow.ts`（#718）
- `src/panels/project/useDeleteFlow.ts`（#718）
- `src/panels/viewport/RenderSettingsPanel.tsx`（#717）
- `src/panels/viewport/ShadingToolbar.tsx`（#717）
- `src/panels/scene-tree/TreeNode.tsx`（#720）
- `src/panels/scene-tree/sceneTreeMenuItems.ts`（#720）
- `src/app/NewProjectModal.tsx`（#722）

## API 改動

- `EditorContext`：新加 `useEditorsRegistry()` hook，`useEditor()` 既有 API 不變
- `core/Editor`：`autosave` 欄位移除 — caller 改用 `bridge.autosaveFlush()`
- `core/scene/AutoSave`：`class AutoSave` → `createAutoSave(editor): AutoSaveHandle`
- `core/index.ts`：barrel export `createAutoSave` + `AutoSaveHandle`（替代原 `AutoSave`）

## Build / Test 驗證

- `npm run build`：✓ pass
- `npx madge --circular`：1 cycle 剩（Editor↔Command 契約核心）
- `npm run test -- AutoSave`：5/5 pass

## 流程紀錄（教訓 / Pitfall）

1. **PanelHeader cycle 修法第一輪錯誤**：先用「PanelHeader 加 editors prop + 8 panel callers 各自 import editors」結果 cycle 從 1 條變 8 條（每 panel 自己形成 cycle）。第二輪改透過 EditorContext 注入才正確 — panel 完全不 import editors，cycle 解掉。教訓：fix circular dep 時要追到「誰打破依賴方向」，不是把連結搬一個地方。
2. **`git checkout -b` HEAD bug**：在 #707 (ProjectTypeIcon) 中因前一步驟的 git chain 中斷，導致實際 commit 落到上一個 branch (fix/panelheader-circular-dep) 而非新 branch。解：cherry-pick 到正確 branch + push。教訓：開新分支前明確 `git status` 驗證當前 branch。
3. **每個 PR 都需 QC**：sandbox policy 強制每個 PR（含 small AH-direct）走 QC，不是只高風險。實際 6/7 PR 都通過，小變更 QC 速度也快（< 1 min）。
4. **scope 微調合理**：#705 issue 寫 `core/project/projectSession.ts`，AH 改放 `app/projectSession.ts` — 因為 core/CLAUDE.md 慣例不寫 localStorage。在 PR 描述中明說。
5. **AD 的設計判斷力 OK**：#710 ViewportPanel 拆分時，AD 發現 issue prose 與實際 line 範圍不符（Scene Lights 在 Shading panel，不在 toolbar），主動調 props 設計並標明，QC 驗過。

## Chain 後續

- ✅ **P2 SceneTreePanel** 已完成（#720 — 確認 #702 closed 後立刻啟動）
- **下次 codebase-health**：建議季末 / 大重構後跑，對照本份 baseline 看趨勢
- **新熱點候選**：areaTree.ts 803 行（chain 未動，現升頂）、Welcome.tsx 608 行 — 下次 health 應評估
- **守護 core/Editor.ts**：仍是耦合中心 + 1 條剩餘 cycle 的端點；任何 Editor 動線改動仍走高風險 PR 路徑（QC 必派）
- **未來 P3/P4 SceneTreePanel**（visibility / selectability / tag）尚未排 issue — 真要做時 TreeNode 已外抽，協作 footprint 較小
