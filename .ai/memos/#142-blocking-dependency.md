# #142 阻擋性依賴：inferNodeType.ts 尚未實作

**日期：** 2026-04-13
**分支：** feat/node-type-properties

## 狀況

properties 模組任務要求：
```typescript
import { inferNodeType } from '../../../core/scene/inferNodeType';
```

但 `src/core/scene/inferNodeType.ts` **不存在**。

## 調查結果

- `feat/node-type-core` 本地分支存在，但指向與 master 相同的 commit（1d33ff7）
- core 分支尚未開始開發，`inferNodeType.ts` 完全未實作
- 遠端無 `feat/node-type-core` 分支（push 也未發生）

## 影響

- `npm run build` 必然失敗（TypeScript 找不到 inferNodeType 模組）
- properties 模組範圍限制禁止修改 `src/core/`，無法自行建立此檔

## 需要的行動（主腦決策）

1. 先派 core 模組 agent 實作 `inferNodeType.ts` 並 merge
2. properties 分支 merge master 取得 core 的改動
3. 再派 properties agent 繼續本任務
