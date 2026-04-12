# #118 Memo — GLTF 轉換器實作

## ResourceCache 整合待辦

`gltfLoader.ts` 目前仍用 `GLTFLoader.parseAsync` 直接解析 buffer，
**未**呼叫 `editor.resourceCache.loadFromBuffer`（因為 #117 尚未 merge，
`Editor.ts` 還沒有 `resourceCache` 屬性）。

當 #117 merge 後，需更新 `gltfLoader.ts`：

```typescript
// 改為：
const gltfScene = await editor.resourceCache.loadFromBuffer(source, buffer);
// 取代目前的 GLTFLoader.parseAsync + gltf.scene
```

這樣 SceneSync（#117 增強後）才能從 ResourceCache clone mesh，
讓匯入的 GLTF 在 viewport 中真正顯示幾何。

## nodePath 空名問題

`gltfConverter.ts` 的 `buildNodes` 在 GLTF 節點無 name 時，
改用 `obj.type`（"Mesh", "Group"）作 nodePath 片段。
此為 best-effort — 若一個 parent 下有多個同 type 的無名節點，
ResourceCache 的 `cloneSubtree` 路徑遍歷可能會取到第一個符合的節點。
→ 可考慮在 nodePath 加 index 後綴（如 `Mesh_0`、`Mesh_1`）作為改善方向。

## Worktree 沒有 node_modules

此 worktree 透過 `ln -s` 指向 main repo 的 node_modules 完成 build。
這是臨時做法，junction/symlink 不受 git 追蹤，換機器需重建。
