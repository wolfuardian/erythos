# #328 drop-to-copy — AT 陷阱備忘

## 關鍵陷阱

1. **writeFile 不呼叫 emit/rescan**（ProjectManager.ts L132-143）
   importAsset 結尾必須 `await this.rescan()` 否則 UI 不更新。已寫入任務。

2. **findFreeName 用 FSA getFileHandle（無 create）**
   只捕 `NotFoundError`，其餘重拋。extension-less 名稱用 lastIndexOf('.') >= 0 判斷。

3. **Preview 字串（L396-398）寫死 3 個資料夾**
   createProject 擴成 6 個後 Preview 字串也要同步更新，否則 UI 撒謊。已放進 app 任務。

4. **onDragOver 必須 preventDefault** 否則 drop 不觸發。已在 app 任務明確指出。

5. **onDragLeave child 元素觸發問題**
   用 `e.currentTarget.contains(e.relatedTarget)` 過濾，已寫入任務。

## AD dispatch 提醒（給 AH）

此任務涉及同一 worktree 兩個模組 CLAUDE.md：
- core AD 讀 `src/core/CLAUDE.md`（commit 1 + 2）
- app AD 讀 `src/app/CLAUDE.md`（commit 3）

可 dispatch 同一個 AD 指示其依序讀兩個 CLAUDE.md 並分 3 次 commit，或分兩個 AD 串行（app 依賴 core 先完成）。
