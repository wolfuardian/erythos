# #105 ViewportPanel UUID 適配備忘錄

## UUID↔Object3D 変換の局所化について

変換層を ViewportPanel（UIレイヤー）に集中させた設計の重要性：

- **core/Selection は純粋な string 操作**になり、Three.js 依存がなくなった
- **bridge.ts も純粋な signal**（string[]）のみ管理、Object3D は一切持ち込まない
- 将来 3D エンジンを変えるときは ViewportPanel の変換部分だけ修正すれば良い

## getUUID の null guard が必要な理由

`editor.sceneSync.getUUID(obj)` が null を返すケースは想定内の正常動作：

- ヘルパーオブジェクト（GridHelpers、GizmoManager の controls）は Three.js シーンに存在するが SceneSync には登録されていない
- SelectionPicker は `addIgnore()` でヘルパーを除外しているが、ゼロリスクではない
- null guard は「このオブジェクトは選択対象外」という意味論的なフィルタであり、エラー防止ではない

## TypeScript 型ガードのパターン

`.filter(Boolean)` では `(Object3D | null)[] → Object3D[]` の型絞り込みができない。
明示的な型ガード `.filter((o): o is Object3D => o !== null)` を使うこと。
