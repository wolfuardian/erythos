# 開發成員 SOP

所有開發 agent 必須遵守此流程。

## 一、開發（新功能）

1. **環境準備**：worktree 沒有 `node_modules`，進場後先跑 `npm install`
2. 讀自己模組的 CLAUDE.md，確認「當前任務」或「待修項」。若任務註明依賴其他 issue，確認該 issue 已 merge 進 master 再開工（否則 build 不會通過）
3. 每個任務對應一個 GitHub issue，確認 issue 內容再動手
4. 實作完成後 commit，格式：
   ```
   [模組] 簡述 (refs #N)

   為什麼做這個改動的一句話說明。
   ```
   - subject：what（做了什麼）
   - body：why（為什麼這樣做），至少一行。純機械性改動（如只改 import 路徑）可省略
   - 新增檔案、改架構、改設計決策的 commit 必須有 body
5. 一律用 `refs #N`，不要用 `closes #N`。issue 的關閉由 QC 複審確認後執行
6. 先驗證再 commit：確認 build 通過或至少 import 正確，不要 commit 後馬上再修自己的錯
7. **還原模組 CLAUDE.md**：開 PR 前，將自己模組的 CLAUDE.md 恢復為乾淨狀態：
   - 使用 `git checkout -- <path>/CLAUDE.md` 還原，或手動清空「當前任務」內容（保留標題和 `<!-- -->` 註解）並移除 Git 規則中的「工作分支」行
   - 還原後用 `git diff <path>/CLAUDE.md` 確認無殘留差異
   - 若 CLAUDE.md 已與 HEAD 一致（無差異），不需要額外 commit
   - 目的：PR 不包含 CLAUDE.md 的 diff，避免 merge 時產生衝突
8. push 後開 PR：
   ```bash
   gh pr create --title "[模組] 簡述 (refs #N)" --body "改動摘要"
   ```
9. 等待 QC 在 PR 上審查

## 二、修正（QC 退回）

1. 從模組 CLAUDE.md「待修項」找到 issue 編號
2. 讀 issue 了解問題的具體描述
3. 只修 issue 指出的問題，不做額外重構
4. commit message 帶 `refs #N`
5. push 後，PR 會自動更新，等待 QC 複審

## 三、自省（防止重犯）

修完 bug 後，判斷這個錯誤是否屬於「下次還可能再犯」的類型。如果是：

1. 在自己模組 CLAUDE.md 的「慣例」區塊補上一條規則
2. 規則要具體可執行，不要寫空泛的提醒
   - 好：`元件一律用 named export，不用 export default`
   - 壞：`注意 export 方式`
3. 自省 commit 也要帶 `refs #N`，標明是因為哪個 issue 而新增的慣例
4. 這樣下次啟動時就會讀到，避免同樣錯誤

## 四、備忘錄

工作中若有 insight、意外發現、改進建議，寫入 `.ai/memos/` 目錄下的獨立檔案。

- 檔名格式：`#N-簡述.md`（例如 `#82-scene-document.md`）
- 內容自由撰寫，不需要特定格式
- 一個任務最多一個備忘錄檔案
- **備忘錄必須在開 PR 之前 commit + push**，確保 merge 時檔案會帶入 master
- 主腦 review 後歸檔至 `.ai/knowledge.md` 或粉碎（刪除檔案）

此機制適用於所有角色（開發、QC、Advisor）。

## 五、禁止事項

- 不得修改自己模組範圍以外的檔案（`.ai/memos/` 除外）
- 不得操作 main/master 分支
- 不得自行 merge
- 不得關閉 issue（由 QC 複審確認後關閉）
- 不得修改根目錄 CLAUDE.md 或其他模組的 CLAUDE.md
