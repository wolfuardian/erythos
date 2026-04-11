# Knowledge Base

知識庫由主腦從備忘錄萃取歸檔，按主題組織。
只收非顯而易見的知識，每條標註來源與適用範圍。

**格式**：每條知識後方標註 `⏳ 適用至 <條件>`，條件滿足時主腦應移除該條目。

**清理時機**：
- merge 收尾時 — 檢查本次 merge 是否滿足某條知識的過期條件
- Phase 交接時 — 全面審查，移除所有已過期條目

---

## 事件系統過渡期注意事項（來源：#91 備忘錄）

- `selectionChanged` payload 目前仍為 `Object3D[]`，V2-2 應一步到位改為 `string[]`，避免 bridge.ts 改兩次 ⏳ 適用至 V2-2 完成
- EditorEventMap 的 `nodeChanged` 仍無 caller — Command 直接操作 SceneDocument（觸發 SceneDocument 事件），Editor-level 事件未被使用。後續需決定：Bridge 監聽 SceneDocument 事件還是 Editor 事件 ⏳ 適用至 V2-6 Bridge 重構
- `autosaveStatusChanged` 型別新增 `'idle'`，但 AutoSave 目前未 emit 此值，後續需確認是否補發 ⏳ 適用至 AutoSave 重構

## Command 設計慣例（來源：#93, #94 備忘錄）

- Command 內直接呼叫 `sceneDocument.addNode/removeNode`，不透過 `editor.addNode`，讓 Command 責務限於資料變更。後續若需 Editor 層事件，再統一決策 ⏳ 適用至 Command 層事件策略定案
- RemoveNodeCommand 子孫快照用 BFS 收集，execute 反向移除（葉先），undo 正向恢復（父先），確保 parent 參照永遠有效 ⏳ 永久
- 快照用 `structuredClone`（非 shallow spread），防止外部修改破壞 snapshot 不變性 ⏳ 永久
- `Vec3` 是 tuple `[number, number, number]`，複製用 `[...value] as Vec3`，不能用 `.clone()` ⏳ 永久
- `{ [property]: value }` 在 strict mode 推斷為 `{ [x: string]: T }`，需 `as Partial<SceneNode>` 轉型（安全的窄化） ⏳ 永久
