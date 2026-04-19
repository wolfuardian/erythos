# CLAUDE.md 4.7 自我重構 Prompt

> 給主腦 AH 用的重構指令。當拿到 4.6 時代撰寫的 CLAUDE.md 時，貼這段到對話中，AH 會依循以下原則自主重構。

---

## 任務

你是這個專案的主腦 AH（Opus 4.7, xhigh effort）。目前的 CLAUDE.md 是 4.6 時代撰寫，請依以下原則重構為 4.7 相容版本。

## 4.7 行為變化（重構動機）

1. **Effort 遵守變嚴格**：low / medium 真的會 scope work，不再主動「多做」
2. **字面指令嚴格化**：寫什麼做什麼，減少自由發揮
3. **Fixed thinking budget 消失**：思考深度只能靠 effort + prompt 引導
4. **預設少開 subagent、少用 tool**：用更多內部 reasoning 代替
5. **Interactive turn 成本高**：multi-turn 比 first-turn-complete 貴

## 重構原則（按優先序）

### 1. 流程 → 契約

**舊模式**：「1. 先做 A、2. 再做 B、3. 然後做 C、4. 最後 D」

**新模式**：
```
目標：<一句話意圖>
驗收：
- <可驗證條件 1>
- <可驗證條件 2>
約束：
- <不可違反的邊界>
異常處理：
- <條件> → <動作>
```

4.7 字面執行步驟時缺少偏離判斷依據，契約化讓模型能自主決定順序並應對異常。

### 2. 「不 X」鷹架 → 正向職責

**舊模式**：「A 角色不自己讀大檔、不自己跑 merge、不自己寫任務、不自己做 code review」

**新模式**：「A 角色的職責是 X、Y、Z（自然排除上述執行工作）」

若負面指令清單超過 3 條，通常代表正向職責定義缺失。

### 3. 間接引用 → skill 化

**舊模式**：「Dispatch prompt 必須指向 .claude/roles/xxx.md」

**新模式**：將 `.claude/roles/xxx.md` 升級為 skill，用 frontmatter 管控：

```yaml
---
name: xxx
description: When <條件>, <動作>. Use when <具體觸發語境>.
model: claude-sonnet-4-6
effort: medium
allowed-tools: Read, Grep, Edit
context: fork
---
```

根文件只需列 skill 清單，不嵌入角色規範內容。

### 4. 補 effort 分層

角色表若只有 model 欄，新增 effort 欄。配置原則：

| 角色類型 | effort |
|---------|--------|
| 機械類（merge、cleanup、格式化） | `low` |
| 實作類（功能範圍明確） | `medium` |
| 判斷類（review、audit、規劃） | `high` |
| 核心決策（主對話、戰略審查） | `xhigh` / `max` |

### 5. 觸發顯性化

**舊模式**：「AH 預設主動詢問指揮家」「或直接繼續推進」「遇到模糊時判斷是否 spawn」

**新模式**：建立「觸發決策表」

```
| 情境 | 觸發 |
|------|------|
| <具體可辨識的條件 1> | <skill 或動作> |
| <具體可辨識的條件 2> | <skill 或動作> |
```

### 6. 加入非目標清單

4.7 的字面性需要明確的 negative space。列出：

- 什麼情況不走這套 SOP？
- 什麼變更不需要走完整流程？
- 什麼角色不該承擔什麼類型的任務？

### 7. Session 級流程抽成 skill

以下內容即便在根文件有意義，也應抽成 skill：

- Session Startup / 交接流程
- Context 保護規則（改成正向職責後）
- DB 讀取紀律
- Merge 收尾具體步驟

根文件只需：「AH 每次 session 開始執行 `session-startup` skill」。

---

## 保留不動的內容

**不要因為重構而丟失**以下資訊：

- 技術事實：技術棧、指令路徑、build 指令、版本限制
- 架構契約：設計模式（Command / Event）、事件順序、模組邊界
- 模組清單、commit 前綴
- 分支命名、PR 通過規則（特別是工程上的硬限制，如「同帳號無法 --approve」）
- Issue 依賴語法（`Depends-on:` / `Blocks:`）

## 遷出策略

- 過往教訓（「參考 #X 教訓」）→ `.claude/lessons/<issue>.md`
- 角色規範詳細內容 → `.claude/skills/roles/<role>/SKILL.md`
- Session / merge / DB 具體步驟 → 對應 skill

根 CLAUDE.md 不累積歷史，只維護契約。

---

## 驗收清單

重構完成應全部勾選：

- [ ] 無純步驟清單（1→2→3→4）留在根文件
- [ ] 無「不 X、不 X、不 X」負面指令堆疊，改為正向職責
- [ ] 角色表有 model + effort 兩欄
- [ ] 有「觸發決策表」：情境 → 觸發什麼 skill
- [ ] 有「非目標清單」：不走 SOP 的情況
- [ ] 有「延伸 skill 清單」：所有外部化 skill 對應
- [ ] 根文件行數降至原版 60-70%
- [ ] 技術事實、架構契約、模組清單、PR 規則原樣保留
- [ ] 無任何「過去某次的教訓」留在根文件

## 工作流程

1. **列問題**：識別到的段落 + 對應問題類型（流程化 / 鷹架 / 間接引用 / effort 缺失 / 觸發模糊 / session 級流程）
2. **提草案**：對照原則提出重構方向，列出會移除 / 抽出 / 改寫的段落
3. **對齊**：與指揮家確認方向
4. **產出**：完整新版 CLAUDE.md + 需要建立的 skill 清單
5. **備份**：舊版另存為 `CLAUDE.md.v4.6.bak`

**不要一次重寫整份**。先對齊方向再動手。
