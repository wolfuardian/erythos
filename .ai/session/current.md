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

- `.ai/roles/` 建立：統一存放角色規範（AT、AD、QC、Advisor）
- 舊的 `advisor/`、`qc/`、`docs/dev-sop.md` 已搬遷並刪除
- CLAUDE.md 加入 Subagent 執行原則（背景執行、dispatch 規範）
- AT 角色首次實測，發現模組邊界問題，已修正
- `.gitignore` 加入 `samples`、`settings.local.json`
- 根目錄 GLB/HDR 素材搬入 `samples/`
- `Erythos.bat` 加入 git

## 當前 pipeline 狀態

**閒置** — 無 open issue、無 open PR、無 active worktree。

## 未解決 / 待討論

- **Session 交接機制**剛建立，尚未驗證新 session 是否能順利讀取並接手
- **AT 調教**：首次實測發現模組邊界問題，已修正但仍需多次實戰驗證
- **Project Hub 尚未實作的功能**：
  - Textures 點擊設為 HDRI（需 viewport 配合）
  - Models 從專案目錄拖曳到 viewport（需 viewport 新 drop path）
  - 專案內 auto-save（目前仍存 localStorage）

## 指揮家偏好（本次觀察到的）

- 喜歡 subagent 背景執行，AH 不要阻塞等待
- 希望 AH 做指揮和決策，不做重活
- 角色檔名要用完整描述性名稱（不要精簡縮寫）
- memo 機制要確保所有角色都有
- 所有設置要能交接給全新 session
