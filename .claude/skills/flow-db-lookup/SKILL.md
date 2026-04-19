---
name: flow-db-lookup
description: When any role (AT / AD / QC / AH) needs to understand module src context before a task, first check `.claude/module-cache/<module>.md` (the EX-maintained knowledge DB) instead of reading full src. Return the DB summary for types / patterns / mines, or report "DB 缺口" / "DB 過時" to AH if the DB is missing or conflicts with src. Invoke at the start of any module-aware task.
model: claude-sonnet-4-6
effort: medium
allowed-tools: Read, Grep
---

# 前置知識 DB 查詢紀律

## 目標

所有需理解模組 src 的角色（AT / AD / QC / AH）**起手先查 DB**，不重讀整模組 src。DB 不足或衝突 → 明確上報 AH，不自行處理。

## 流程

```
角色收到任務
  → 查 .claude/module-cache/<module>.md
    ├─ 存在 → 讀速覽（types / pattern / 地雷 / 最近 PR）
    │         細節用 Read + offset/limit 精準補讀 src
    └─ 不存在或嚴重不足 → 標 DB 缺口 上報 AH 考慮 spawn role-explorer
                           該次任務仍按 src 現況執行（不阻塞）
  → DB 與 src 明顯衝突 → 標 DB 過時 上報 AH 考慮 spawn role-explorer 刷新
                          按 src 現況工作，**不自行改 DB**
```

## 驗收

- 起手先查 DB，不跳過
- DB 存在 → 讀速覽當信任基準
- 缺口 / 過時 → 明確標記上報，**不自改 DB**
- 需細節 → 用 `Read` + offset/limit 精準讀 src，不整檔讀

## 信任基礎

EX 對照 src 驗證 + 抽樣 2-3 關鍵 fact 交叉確認。DB 是 `role-explorer` 產物，**預設可信**。不因 DB 可能過時就重讀整模組 src。

## 上報格式

回報（PR body / QC comment / AT 結論）中標：
- **DB 缺口 #N** + 一句描述：DB 不存在或嚴重缺關鍵資訊
- **DB 過時 #N** + 衝突點描述：DB 與 src 事實衝突

AH 會判斷是否 spawn `role-explorer` 補 / 刷新。

## 約束

- 不因疑心重讀整模組 src（效率優先）
- 衝突走「上報 AH」路徑，不自處理

## 異常處理

| 條件 | 動作 |
|------|------|
| DB 檔不存在 | 標「DB 缺口」上報 AH；按 src 做 |
| DB 關鍵 fact 缺失 | 同上 |
| DB 與 src 衝突 | 標「DB 過時」上報；按 src 做 |
| DB ≤ 80 行但資訊足夠 | 正常讀用 |
