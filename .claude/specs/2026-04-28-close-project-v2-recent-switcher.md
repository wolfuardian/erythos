# Close Project v2 — Dropdown 內 Recent Projects switcher

**狀態：** 待實作
**Mockup：** [.claude/previews/close-project-v2.html](../previews/close-project-v2.html)
**前一版：** [2026-04-28-close-project-design.md](2026-04-28-close-project-design.md)（v1，PR #660 已 merged）

---

## 1. 目標

擴充 v1 的 Toolbar 專案 chip dropdown：在 `Close Project` 之上加入 Recent Projects 列表，使用者可在 Toolbar 內直接切換專案，無需先 Close 再從 Welcome 挑。前 10 筆內聯顯示，超過用 `Show more (n)` 就地展開（不跳 Welcome），展開後 max 20 行再 scroll。

**取代 v1 spec §10 的「為何不做 Switch Project」決議** — v1 的論點「Switch ≡ Close + Open，Welcome 已涵蓋」仍正確，但 v2 採用更省步驟的形式：dropdown 內 inline list 不是新加 Switch entry，而是把 Welcome 的 Recent Projects 視覺化搬進 dropdown。

---

## 2. 與 v1 的關係

| 元素 | v1 (已 ship) | v2 (本 spec) |
|------|--------------|--------------|
| chip 樣式 | 既有 | **不變** |
| dropdown 寬度 | 160px | 300px |
| dropdown 內容 | 只有 `Close Project` | Recent list + `Show more` + divider + `Close Project` |
| autosave error confirm | 已有 | 沿用同 ConfirmDialog 元件，套用到「切換專案」流程 |
| `closeProject` callback | 已 wired | **不變** |
| `recentProjects` 暴露 | 無 | **新增**：bridge `Accessor<ProjectEntry[]>` |
| `openProjectById` callback | 無 | **新增**：bridge 注入 |

---

## 3. UI 規格

### 3.1 Dropdown 五個狀態（mockup 為 source of truth）

| State | 觸發 | 內容 |
|-------|------|------|
| **A1 Collapsed** | 預設、totalRecent > 10 | sub-header `RECENT PROJECTS` + 前 10 行 + `Show more (n) ↓` + divider + `Close Project` |
| **A2 Expanded** | A1 點 `Show more` | sub-header + 全部 N 行（list 區 `max-height: 560px` = 20 row + scrollbar）+ `Show less ▴` + divider + `Close Project` |
| **B Few** | totalRecent ≤ 10 | sub-header + 全 N 行 + (無 show more) + divider + `Close Project` |
| **C Empty** | totalRecent = 0 | 只有 `Close Project`（省略孤立 sub-header / divider） |
| **D Current-in-list** | A1/A2/B 任一含當前 project | 該 row：`background: rgba(82,127,200,0.08)` + `border-left: 2px solid var(--accent-blue)` + `cursor: default`，name 旁加 `CURRENT` badge |

### 3.2 Project row 結構

橫向 layout：`[24×24 thumbnail placeholder] [project name (overflow ellipsis)] [lastOpened time]`

- thumbnail：`folder` icon placeholder（v2 不接真實 thumbnail，留 follow-up）
- name：`color: var(--text-primary)`，`font-size: var(--font-size-sm)`，截斷
- time：`color: var(--text-muted)`，`font-size: var(--font-size-xs)`，靠右
- row height：28px（min-height）
- hover：`background: var(--bg-hover)`（current row hover 略深）

### 3.3 Show more / less

- `Show more (n) ↓`：n = `totalRecent - 10`
- `Show less ▴`：A2 狀態出現
- 樣式同 dropdown 內 entry，但字體用 `var(--text-secondary)` 略淡
- 點擊**只切 dropdown 內部 expand state**，不關閉 dropdown、不 close project、不跳 Welcome

### 3.4 List 區捲動規則

- A1：`overflow: hidden`，DOM 端只 render 10 行（不是 CSS truncate；避免半行露出）
- A2：`max-height: 560px` + `overflow-y: auto`（超過 20 行才出 scrollbar）
- B：natural height，無 scroll
- divider + `Close Project` 固定在 list 區外（不跟著 scroll）

---

## 4. Component 設計

### 4.1 修改 `src/components/ProjectChip.tsx`
新增 props：
```typescript
interface Props {
  projectName: string;
  autosaveStatus: 'idle' | 'pending' | 'saved' | 'error';
  onCloseProject: () => void;
  // v2 新增
  recentProjects: ProjectEntry[];
  currentProjectId: string | null;  // 用於標 CURRENT
  onOpenProject: (id: string) => Promise<void>;
}
```

新增內部 state：
- `expanded: boolean`（A1/A2 切換）

新增渲染區塊：
- list region（前 10 或全部，視 expanded）
- show more / less button

### 4.2 修改 `src/app/bridge.ts`
新增 EditorBridge 欄位：
- `recentProjects: Accessor<ProjectEntry[]>` — 訂閱 `projectManager.onChange()`，refresh from `getRecentProjects()`
- `currentProjectId: Accessor<string | null>` — 取自當前已開 entry 的 id
- `openProjectById: (id: string) => Promise<void>` — caller 注入

EditorBridgeDeps 新增：
- `openProjectById: (id: string) => Promise<void>`

### 4.3 修改 `src/app/App.tsx`
- 把 `openProjectById(id)` 流程包成 callback 傳給 bridge：
  ```typescript
  const openProjectById = async (id: string) => {
    const handle = await projectManager.openRecent(id);
    if (!handle) return;
    await closeProject();
    await openProject(handle);
  };
  ```
- bridge 構造時傳 `{ closeProject, projectManager, openProjectById }`
- 若需要 `currentProjectId`，從 `projectManager` 暴露（看是否要在 ProjectManager 加 `currentId` getter，或 App 層自己維護）

### 4.4 修改 `src/components/Toolbar.tsx`
傳新增的三個 props 給 ProjectChip：
```jsx
<ProjectChip
  projectName={bridge.projectName() ?? ''}
  autosaveStatus={bridge.autosaveStatus()}
  onCloseProject={bridge.closeProject}
  recentProjects={bridge.recentProjects()}
  currentProjectId={bridge.currentProjectId()}
  onOpenProject={bridge.openProjectById}
/>
```

### 4.5 (新) `src/core/project/ProjectManager.ts`
若決定加 `currentId` getter，這是 core 改動：
```typescript
get currentId(): string | null {
  return this._currentId;  // 在 openHandle 時 set
}
```
**待 AD 決策實作位置**：core 加欄位 vs app 層維護。本 spec 偏好 core 加欄位（語意正確 + 重用容易）。

---

## 5. Data flow

### 5.1 一般切換
```
User clicks recent project row
  ↓
ProjectChip 檢查 props.currentProjectId === entry.id？
  ↓ no                                       ↓ yes (current row)
checks autosaveStatus()                      no-op (cursor default 已防點)
  ↓                                  ↓
'error' → ConfirmDialog              其他 → 直接 onOpenProject(entry.id)
  ↓ (Continue Anyway)
onOpenProject(id)
  ↓
bridge.openProjectById(id) (App 注入)
  ↓
App.openProjectById：
  handle = projectManager.openRecent(id)
  await closeProject()
  await openProject(handle)
  ↓
新 bridge 重建，ProjectChip 重新 mount，dropdown 自動關閉（autosaveStatus / projectName 重置）
```

### 5.2 Show more / less
```
User clicks Show more (n)
  ↓
ProjectChip setExpanded(true)
  ↓
list region 切到 A2（render 全部 + max-height 560px + scrollbar）
按鈕變 Show less ▴
[dropdown 不關，project 不切]
```

### 5.3 ConfirmDialog 文案調整

v1 confirm 用於 Close Project；v2 同 confirm 也要 cover「切換專案」場景。建議文案改為通用形式：
- title: `Save Failed — Continue Anyway?`
- message: `Recent changes could not be saved. Continuing will lose them.`
- confirm: `Continue Anyway`
- cancel: `Cancel`

action 視觸發來源（close vs open new）分流：confirm 後執行對應動作。

---

## 6. 錯誤處理

| 情況 | 處理 |
|------|------|
| autosave 處於 `error` 時點任何 recent project | 彈 ConfirmDialog（共用 v1），confirm → 執行 `openProjectById`；cancel → no-op |
| autosave `pending` 時切 project | 不擋；`closeProject` 內 `await autosave.flushNow()` 會等 |
| `openRecent(id)` permission denied / handle 失效 | App 層 catch，bridge 回 false / 呼叫 errorDialog（沿用 Welcome 既有錯誤處理 pattern） |
| 點當前 project (currentProjectId 相符) | UI 端 `cursor: default` + 不掛 click handler（防呆） |
| `recentProjects` empty 時 | dropdown 直接退化成 v1 形態（State C） |

---

## 7. 測試

待 #661（SolidJS testing harness）完成後補。本 spec 提供測試清單供日後 fulfill：

### 7.1 ProjectChip
- A1：項目數 = 15 → 顯示前 10 + Show more (5) + divider + Close Project
- A2：點 Show more → 顯示 25 個 + Show less + scrollable
- 點 Show less → 退回 A1
- B：項目數 = 5 → 全顯示無 show more
- C：項目數 = 0 → 只有 Close Project（無 sub-header / divider）
- D：含當前 project → 該 row highlight + 不可點
- 點普通 row → 觸發 `onOpenProject(id)`
- autosave error 時點 row → 先彈 ConfirmDialog；Cancel 不觸發；Continue 觸發

### 7.2 Bridge
- `recentProjects` 訂閱 `projectManager.onChange()`，project add/remove 後 list 更新
- `currentProjectId` 切換 project 後正確更新

### 7.3 Integration
- open Project A → switch to Project B 流程：autosave flush → close A → open B → chip 顯示 B name → recentProjects 排序 B 在最前

---

## 8. Out of scope

- Recent project thumbnail（v2 留 placeholder folder icon）— 之後與 prefab thumbnail 機制統合考量
- Project rename / pin / 排序自訂
- Show more 行為的替代方案（A. 跳 Welcome、B. 內展開、C. file picker）— v2 鎖定 B「內展開」
- Recent list 搜尋 / filter
- 多視窗 / 多 project 同時開
- v2 行為的 unit/integration 測試實作（依 #661 進度）

---

## 9. 模組邊界

| 模組 | 改動 |
|------|------|
| `[components]` | 修改 `ProjectChip.tsx`（dropdown 內容擴展）、修改 `Toolbar.tsx`（傳新 props）、可能修改 `ConfirmDialog.tsx`（如要支援更通用文案；或在 ProjectChip 端傳 props） |
| `[app]` | 修改 `bridge.ts`（加 recentProjects / currentProjectId / openProjectById）、修改 `App.tsx`（注入 openProjectById callback） |
| `[core]` | 修改 `ProjectManager.ts`（加 currentId getter — 可選，AD 自行決定 in-app or in-core） |

不違反三條核心契約。

---

## 10. 變更紀錄

| 日期 | 內容 |
|------|------|
| 2026-04-28 | 建立 v2 spec — dropdown 加 recent projects + show more/less，取代 v1 spec §10 的「不做 Switch」結論（同 idea 不同形式） |
