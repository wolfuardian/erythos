# Knowledge Base

知識庫由主腦從 memos.md 萃取歸檔，按主題組織。
只收非顯而易見的知識，每條標註來源。

---

## 事件系統過渡期注意事項（來源：#91 備忘錄）

- `selectionChanged` payload 目前仍為 `Object3D[]`，V2-2 應一步到位改為 `string[]`，避免 bridge.ts 改兩次
- `nodeChanged` 已定義但 Editor 尚無 caller，需在後續 Command PR 中補上
- `autosaveStatusChanged` 型別新增 `'idle'`，但 AutoSave 目前未 emit 此值，後續需確認是否補發
