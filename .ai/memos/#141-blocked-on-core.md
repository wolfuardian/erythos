# #141 scene-tree badge blocked on core inferNodeType

## 狀況

scene-tree agent 已完成 `SceneTreePanel.tsx` 的 badge 改寫：
- 移除 `hasChildren` 結構性猜測邏輯與 `// Temporary` 備註
- 改用 `inferNodeType(props.node)` + switch 對應 badge label/color
- `hasChildren` 仍保留（展開箭頭使用）

## 阻擋

`src/core/scene/inferNodeType.ts` 不存在。
`feat/node-type-core` 分支目前與 master 完全相同，core agent 尚未實作。

build 錯誤：
```
error TS2307: Cannot find module '../../core/scene/inferNodeType' or its corresponding type declarations.
```

## 後續動作

1. 派 core agent 在 `feat/node-type-core` 建立 `inferNodeType.ts`（含 `NodeType` type + 從 `SceneNode.components` 推導的邏輯）
2. core PR merge 後，scene-tree agent 可接著跑 build → commit → push → 開 PR

## 程式碼狀態

working tree 已有改動（未 commit），可直接接續。
