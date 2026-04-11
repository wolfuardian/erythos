# #91 EventEmitter UUID-based 事件重構 — 備忘錄

## selectionChanged payload 問題

目前 `selectionChanged` 仍發 `Object3D[]`，EventMap 中型別保留原狀。
CLAUDE.md 指示等 V2-2 才改為 `string[]`。

但這造成一個輕微的型別不一致：其他新事件都是 UUID string，
`selectionChanged` 卻混用物件參照——若後續有訂閱者只依賴 `selectionChanged`，
他們拿到的是物件不是 UUID，與新事件設計的「解耦」精神矛盾。

**建議 V2-2 處理時一步到位**，不要再分拆，避免 bridge.ts 需要改兩次。

## nodeChanged 沒有 caller

`nodeChanged` 已加入 EventMap 和測試（直接 emit），但 Editor.ts 尚無任何方法 emit 它。
目前 legacy 的 `objectChanged()` 方法仍在，V2-2 / V2-3 應新增 `nodeChanged()` 並對應
`SceneDocument` 的 dirty 通知。

## autosaveStatusChanged 加了 'idle'

原本 payload 只有 `'pending' | 'saved'`，此 PR 補上 `'idle'`。
AutoSave 目前只 emit `'pending'` 和 `'saved'`，需確認 V2-x 中 AutoSave
是否補發 `'idle'`（例如初始化時或 clear 後）。若不補，`'idle'` 只存在型別中但永不出現。
