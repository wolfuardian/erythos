# role-pr-qc rules/

結構化規則，role-pr-qc skill 在 Phase 0 機器閘門跑：

```bash
sg scan -r .claude/skills/role-pr-qc/rules/
```

命中即 `QC FAIL`（error）或 flag 給 LLM 補判（warning）。`sg` 未裝 → review-blocked，非 QC FAIL（細節見 SKILL.md Phase 0）。

## 現有規則

| id | 嚴重度 | 意圖 |
|---|---|---|
| `must-use-editor-execute` | error | 禁止繞過 Command 模式直呼 editor.addObject |
| `solid-onmount-needs-oncleanup` | warning | onMount 要有配對 onCleanup |
| `event-order-objectadded-needs-scenegraphchanged` | warning | emit 事件順序契約 |

## 新增規則的時機

跑 QC 時 LLM 抓到一個新違規模式 → 在 PR comment 標記「可加 rule:<簡述>」。**Rule 落檔（寫 yml）是 AH 後續工作** — QC subagent 沒 Edit/Write tool，無法自寫 rule。原則：

- 結構可表達 → AH 寫規則
- 需跨檔語意或型別推理 → 先 TODO，累積到數量夠再一次解
- 只出現一次的特例 → 不寫，當 one-off

## Calibrate

每條規則開頭的 comment 都標了已知 calibration 點（目錄排除、Command 基底名等）。跑起來誤報多時改 `ignores` / `inside` / `not` 即可，不要降 severity 遷就。

## 快速測試

寫完規則先跑：

```bash
# 只掃不改
sg scan -r rules/must-use-editor-execute.yml
# 互動式 review
sg scan -r rules/ --interactive
```

規則本身有 bug（pattern 語法錯）會 parse 失敗，scan 會報錯，第一次跑起來就知道。
