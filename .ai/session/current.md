# Session 狀態（2026-04-17）

## 本次完成的 issue

| # | 標題 | PR | merge SHA |
|---|------|-----|-----------|
| #301 | overlay 返回鍵置左 + 隱藏 New/Add（前段session） | #302 | `b583752` |
| #303 | Hub/overlay header 高度一致（30px） | #304 | `c12be1e` |
| #305 | 加 Preview 標題 + box 常駐 | #306 | `130201f` |
| #307 | Preview label + box 包進 wrapper div | #308 | `1e3691a` |
| #309 | New project 同名資料夾偵測 + 禁止建立 | #312 | `dda1cbd` |
| #311 | ConfirmDialog 英文化 + label props | #313 | `b6f2e5c` |
| #310 | Close → Close project + 確認對話框 | #314 | `f5a5a01` |

## 角色 / 流程新增

### MP（Mock-Preview）角色正式化
- `.ai/roles/mock-preview.md` 新增
- 根 CLAUDE.md 角色表 + UI 腦爆階段流程 + dispatch 規範 全部到位
- 配套：`.ai/previews/` 目錄慣例、issue body `Mockup:` 行、PM step 7 清理 mockup
- 本次還沒正式用過 MP（#309/#310 都屬豁免或明確方案）

### 8 項流程優化（commit `cf50b0a`）
1. **Fast path** — 豁免級變更 AH 自寫任務跳過 AT
2. **Pre-flight RD** — 跨模組 API 未明時開 issue 前先掃檔
3. **Issue 依賴標注** — `Depends-on:` / `Blocks:`，session startup 建圖
4. **Agent 明寫 model** — 避免默默升 Opus
5. **AH 讀 offset+limit** — 只讀當前任務段、信任 AT 摘要
6. **AT Lite 模式** — 極簡任務產出 < 30 行
7. **模型一致化** — 同 #4
8. **知識沉澱** — FSAA / theme.css / ConfirmDialog API / Solid DevTools / workflow 慣例寫進 knowledge.md

### pr-merge step 9 防呆（commit `38410bc`）
PM 不再盲用 `git add -A`，按檔案模式決定 commit / 跳過。根 `CLAUDE.md` / `.ai/roles/*.md` / `.ai/knowledge.md` / `.ai/specs/*` 一律跳過（AH 可能正在改）。

## 本次驗證

- **雙 pipeline 並行壓力測試**：#309 / #310 並行，#310 跑到一半發現 ConfirmDialog 需要前置作業 → 開 #311 阻擋、收掉 #310 worktree、#311 merge 後重開 #310，全程順暢
- **Fast path 尚未實測**（#303 header fix 當時還沒 Fast path 規則，仍走完整流程）
- **AT Lite 尚未實測**
- **AH context 節約新習慣**本 session 已套用於讀 AT-C 產出（用 offset+limit 省 ~30 行）

## 未解決 / 待討論

- **UIUX 推理輔助角色構想**（`project_uiux_reasoner_idea.md`）：指揮家於 #307 發現 Preview 缺 wrapper 與 Location 不一致，提出需要「非視覺化、專掃設計一致性」的角色。暫未立角色檔案，待下次討論。三個候選定位：新角色 UXR / 擴 AT 職責 / 擴 QC 職責
- **MP 角色實戰驗證**：規範已到位，待遇到合適的 UI 腦爆情境實測
- **Fast path / Lite mode 實戰驗證**：同上，遇到豁免或極簡任務時試用
- **Project Hub 尚未實作的功能**：
  - Textures 點擊設為 HDRI（需 viewport 配合）
  - Models 從專案目錄拖曳到 viewport
  - 專案內 auto-save（目前仍存 localStorage）

## 指揮家偏好（本 session 新觀察）

- **DevTools outerHTML flow**：指揮家樂意用 DevTools 抓 outerHTML 給 AH 定位。甜蜜點 5~20 行，超過 100 行太多。Copy selector / XPath 對 AH 無用，Copy outerHTML 才有用
- **拒絕冗長格式**：spec 決策過程 A/B/C 連問幾輪被稱讚效率高；冗長的設計文件會被要求「spec 可以清一下」
- **偏好並行**：雙 track 並行時未要求減速；冷靜接受 merge 階段要序列化的限制
- **MP 品質驗收**：第一次產出即評為品質高，並主動提議立為固定角色
- **願意承擔流程重構**：給出 8 項建議後直接說「全部都可以落實」而非挑選
- **零容忍 pipeline 瑕疵**：#304 QC FAIL 由 AH 操作疏失引起，指揮家正視並確認要深度修復（push master）而非 force-push 繞過
- **`.ai/user/` 是個人工作檔**：發現誤 commit 後選 B（gitignore + untrack），不要 force-push 改歷史

## Session context 觀察

- 本次 session 從早期流程摸索轉成後半段批量討論改進，整體資訊密度很高
- Session 末尾指揮家用「好喔，繼續」確認繼續 pr-merge step 9 待補項，收尾乾淨
