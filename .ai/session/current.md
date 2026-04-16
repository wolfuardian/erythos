# Session 狀態（2026-04-16）

## 本次完成的 issue

| # | 標題 | PR |
|---|------|-----|
| #273 | ProjectManager（File System Access API） | #274 |
| #279 | Editor 整合 ProjectManager | #281 |
| #280 | Toolbar Save 整合 ProjectManager | #282 |
| #283 | ProjectManager 多專案支援（Hub 後端） | #285 |
| #284 | Project Panel — Hub 清單 + 檔案瀏覽器 | #286 |
| #287 | ProjectManager — createProject / addFromDisk / 驗證 | #289 |
| #288 | Project Panel — New / Add / Status | #290 |
| #291 | New Project 路徑預覽 | #292 |
| #293 | New Project overlay 浮動面板 | #294 |
| #295 | New Project overlay 滑入動畫 | #296 |

## 本次基礎建設改動

- `.ai/roles/` 建立並統一存放所有角色規範
  - AT（Tasker）、AD（Developer）、QC（pr-qc）、PM（pr-merge）、AA（Advisor）、RD（Reader）
- 舊的 `advisor/`、`qc/`、`docs/` 已搬遷並刪除
- CLAUDE.md 大幅更新：
  - 角色表加入 AT、PM、RD
  - Subagent 執行原則（背景執行、dispatch 規範）
  - Reader 大軍模式（任何角色可批量 spawn RD 並行讀取）
  - AH Context 保護規則
  - Session 交接機制（.ai/session/）
  - Merge 後收尾拆分 PM/AH 職責
- 各角色加入 Context 預算限制
- `.gitignore` 加入 `samples`、`settings.local.json`
- 根目錄散落的 GLB/HDR 搬入 `samples/`
- `Erythos.bat` 加入 git

## 當前 pipeline 狀態

**閒置** — 無 open issue、無 open PR、無 active worktree。

## 未解決 / 待討論

- **AT 調教**：首次實測發現模組邊界問題，已修正規範但仍需多次實戰驗證
- **PM 角色**：已建規範但從未實測
- **RD 大軍模式**：已建規範但從未實測
- **Project Hub 尚未實作的功能**：
  - Textures 點擊設為 HDRI（需 viewport 配合）
  - Models 從專案目錄拖曳到 viewport（需 viewport 新 drop path）
  - 專案內 auto-save（目前仍存 localStorage）

## 指揮家偏好

- subagent 一律背景執行，AH 不阻塞等待
- AH 做指揮和決策，重活全部外包給 Sonnet 角色
- 角色檔名要完整描述性（不精簡縮寫）
- memo 機制確保所有角色都有
- 所有設置要能交接給全新 session
- 理解需求 + 拆 issue + 建 worktree 是 AH 核心工作，不外包
- PR 相關角色用 `pr-` 前綴命名（pr-qc、pr-merge）
