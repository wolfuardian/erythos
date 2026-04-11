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
- `nodeChanged` 已定義但 Editor 尚無 caller，需在後續 Command PR 中補上 ⏳ 適用至 V2-3 完成
- `autosaveStatusChanged` 型別新增 `'idle'`，但 AutoSave 目前未 emit 此值，後續需確認是否補發 ⏳ 適用至 AutoSave 重構
