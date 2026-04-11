# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] 專案-場景讀取機制（#33）
  - 新增 `src/core/scene/SceneLoader.ts`：
    - `loadScene(path: string): Promise<SceneData>` — 讀取 .scene 檔案並解析
    - `saveScene(path: string, data: SceneData): Promise<void>` — 將場景資料寫入 .scene 檔案
    - 場景檔約定路徑：`runtime/project_{name}/assets/scenes/{場景檔}.scene`
    - 使用 `src/core/scene/SceneFormat.ts` 中定義的型別（來自 #34）
  - 如果 #34 尚未 merge，先自行在檔案內定義臨時型別，merge 後再對齊
  - 檔案系統操作同 #32：優先用 Vite server API，不行就 mock + 上報

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307

## Git 規則
- 工作分支：feat/scene-read
- commit 訊息格式：`[core] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[core] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
