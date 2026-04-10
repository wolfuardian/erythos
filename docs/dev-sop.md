# 開發成員 SOP

所有開發 agent 必須遵守此流程。

## 一、開發（新功能）

1. 讀自己模組的 CLAUDE.md，確認「當前任務」或「待修項」
2. 每個任務對應一個 GitHub issue，確認 issue 內容再動手
3. 實作完成後 commit，message 格式：
   ```
   [模組] 簡述 (refs #N)
   ```
4. 一律用 `refs #N`，不要用 `closes #N`。issue 的關閉由 QC 複審確認後執行
5. push 後等待 QC 審查

## 二、修正（QC 退回）

1. 從模組 CLAUDE.md「待修項」找到 issue 編號
2. 讀 issue 了解問題的具體描述
3. 只修 issue 指出的問題，不做額外重構
4. commit message 帶 `refs #N`
5. push 後等待 QC 複審

## 三、自省（防止重犯）

修完 bug 後，判斷這個錯誤是否屬於「下次還可能再犯」的類型。如果是：

1. 在自己模組 CLAUDE.md 的「慣例」區塊補上一條規則
2. 規則要具體可執行，不要寫空泛的提醒
   - 好：`元件一律用 named export，不用 export default`
   - 壞：`注意 export 方式`
3. 這樣下次啟動時就會讀到，避免同樣錯誤

## 四、禁止事項

- 不得修改自己模組範圍以外的檔案
- 不得操作 main/master 分支
- 不得自行 merge
- 不得關閉 issue（由 QC 複審確認後關閉）
- 不得修改根目錄 CLAUDE.md 或其他模組的 CLAUDE.md
