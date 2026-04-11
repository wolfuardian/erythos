# #93 AddNodeCommand / RemoveNodeCommand 実装メモ

## BFS 順序の重要性

RemoveNodeCommand の子孫スナップショット収集は BFS（幅優先）で行う。

- **execute()**: `childSnapshots` を逆順（末尾から）で removeNode → 葉ノードを先に削除できる。
  これにより SceneDocument の `getChildren` が空になる前に子から削除される。
- **undo()**: `snapshot`（自分）を先に addNode、次に `childSnapshots` を順順で addNode → 親ノードが先に存在するので子の `parent` 参照が有効になる。

逆順でないと、子がまだ存在する状態で親を削除するシナリオは `removeNode` が内部で Map から削除するだけなので実は動くが、undo 時に子の `addNode` が親ノードより先に実行されると `parent` フィールドが指す UUID がまだ存在しない。SceneDocument は現在 parent の存在チェックをしないが、将来的なバリデーション追加時に問題になる可能性がある。BFS 順序を守ることで安全性を確保。

## structuredClone の選択

`{ ...node }` の shallow spread では `position`, `rotation`, `scale` の配列や `components`, `userData` のオブジェクトが参照共有される。コマンドが構築されてから execute() までの間に外部コードがノードを変更した場合にスナップショットが壊れる。`structuredClone` で deep copy することで snapshot の不変性を保証。

## SceneDocument vs Editor API の使い分け

Command 内では `this.editor.sceneDocument.addNode/removeNode` を直接呼ぶ（SceneDocument のイベントが発火する）。
`this.editor.addNode/removeNode` を呼ぶと Editor レイヤーのイベント（`nodeAdded`, `nodeRemoved`）も発火するが、Command の責務はデータ変更のみに留めるため、SceneDocument に直接アクセスする方が適切。
（将来的にどちらを呼ぶべきか、主腦に確認を推奨）
