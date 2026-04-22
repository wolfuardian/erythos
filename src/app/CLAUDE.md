# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Task 7：DockLayout immediate-save-on-first-mount（refs #518）

**背景**：preset grid 首次 mount 時 `grid: {}` 是空物件。若使用者在 300ms debounce 結束前按 `+` 複製 workspace，`addWorkspace` 會深拷貝這個空 grid，導致新 workspace 套用空白佈局而非現有三欄。解法：onMount 套完 `applyWorkspace` 後立即同步存一次 grid，不等 debounce。

**要改的檔案**：

#### 1. `src/app/layout/DockLayout.tsx`

在 `applyWorkspace(api, currentWorkspace())` 之後、`props.onReady?.(api)` 之前，加入立即存一次 grid 的呼叫。

最簡做法：把 debounce 內的邏輯抽出為 `saveNow()`，onMount 末尾複用。

參考修改（AD 可直接套用）：

```tsx
onMount(() => {
  const api = createDockview({
    parentElement: containerRef,
    components: props.components,
  });

  applyWorkspace(api, currentWorkspace());

  // ★ 新增：首次 mount 立即存 grid，防止 300ms race
  const saveNow = () => {
    mutate(s => updateCurrentWorkspace(s, {
      grid: api.toJSON(),
    }));
  };
  saveNow();

  props.onReady?.(api);

  let saveTimer: number | undefined;

  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, DEBOUNCE_MS);
  };

  const disposeLayout = api.onDidLayoutChange(scheduleSave);

  // 切 workspace → clear + apply
  let lastId = store().currentWorkspaceId;
  createEffect(() => {
    const id = store().currentWorkspaceId;
    if (id !== lastId) {
      lastId = id;
      api.clear();
      applyWorkspace(api, currentWorkspace());
      saveNow(); // ★ 新增：切換 workspace 後也立即存
    }
  });

  onCleanup(() => {
    window.clearTimeout(saveTimer);
    disposeLayout.dispose();
    api.dispose();
  });
});
```

注意：`editorTypes` 不需要在 DockLayout 中收集，AreaShell 在使用者切換 editor type 時已即時寫入 store。首次 mount 只需存 `grid`。

#### 2. `src/app/CLAUDE.md` 慣例區塊

在「## 慣例」下加一行：

```
- workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout / WorkspaceTabBar 皆訂 store signal
```

**操作步驟（AD 嚴格照做）**：

1. 實作 `src/app/layout/DockLayout.tsx`（依上方 diff）
2. `npm run build` — 確認通過
3. 手動 QA：`localStorage.clear()` → 重整 → 立即按 `+` 複製 workspace → 確認新 workspace 套用三欄佈局而非空白
4. 還原 CLAUDE.md 並加慣例：
   ```bash
   git show master:src/app/CLAUDE.md > /tmp/master-claude.md
   # 手動在 /tmp/master-claude.md 的「## 慣例」下加那一行
   # （用 Edit tool，找「- 不在 app 層寫業務邏輯」那行，在其後插入）
   cp /tmp/master-claude.md src/app/CLAUDE.md
   ```
   或更簡單（**推薦**）：
   ```bash
   git checkout master -- src/app/CLAUDE.md
   # 再用 Edit tool 在慣例區塊加那一行
   ```
5. Commit（含 DockLayout.tsx 和 CLAUDE.md）：
   ```bash
   git add src/app/layout/DockLayout.tsx src/app/CLAUDE.md
   git commit -m "[app] DockLayout immediate-save-on-first-mount 修 preset race (refs #518)"
   ```
6. Push 並開 PR：
   ```bash
   git push -u origin feat/518-preset-finalize
   gh pr create \
     --title "[app] DockLayout immediate-save-on-first-mount 修 preset race (#518)" \
     --body "$(cat <<'EOF'
   ## Summary
   - 原 Task 7 計畫硬編 Dockview JSON，但 api 未暴露 window 且 opaque JSON 難維護，指揮家已確認改範圍
   - onMount 套完 applyWorkspace 後立即同步寫一次 grid（不等 300ms debounce），防止使用者快按 + 時複製到空 grid
   - 切換 workspace 時同樣立即存一次
   - 慣例區塊補記 workspaceStore 架構說明

   ## 驗收
   - [ ] npm run build 過
   - [ ] 清 localStorage 重整 → 立即按 + → 新 workspace 套用三欄佈局（非空白）
   - [ ] 切 workspace tab 正常

   Closes #518
   EOF
   )"
   ```

**地雷**：
- `saveNow` 定義必須在 `applyWorkspace` 之後（需要 `api` 已建立）
- 不要改 `workspaceStore.ts` 的 `createLayoutPreset` / `createDebugPreset`
- 不要改 `workspaceLayout.ts` 的 `applyPresetFallback`
- CLAUDE.md 的「當前任務」區塊必須還原（用 git checkout master -- 整檔還原再加慣例，不要手動只還原一部分）

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
