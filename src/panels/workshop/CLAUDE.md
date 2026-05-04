# Workshop Panel 模組

## 範圍限制

只能修改 `src/panels/workshop/` 底下的檔案。
`src/app/editors.ts` 允許一行 import + 一行 array 追加（workshopDef registration）。

不得修改 `src/core/`、`src/viewport/`、`src/components/`、`src/app/bridge.ts`、其他 `src/panels/`。

## 慣例

- 透過 `useEditor()` 拿 `bridge.projectFiles()` 讀取專案檔案清單
- Sandbox 狀態（SceneDocument、History、SceneSync、renderer）全部 panel-local：`onMount` 建立、`onCleanup` 釋放
- Workshop **絕對不呼叫 `editor.execute()`**：所有 sandbox 變更直接操作 `sandboxDocument`，或用 `sandboxHistory.execute()` 包 Command
- `sandboxHistory` 在 P2 僅作為佔位符（clear on discard），undo/redo 留給 P3 串接
- 樣式用 CSS Modules（`*.module.css` colocated）
- 拖曳 payload 格式：`application/erythos-asset`，值為 `JSON.stringify({ type: 'glb', path })`

## Shared resourceCache 注意事項

Workshop 共用主 editor 的 `resourceCache`（透過 `bridge.editor.resourceCache`）。
當 Workshop 載入一個 GLB 而主場景尚未載入時，Workshop 的 `loadFromURL` 會填入 shared cache。
這是刻意設計（cache 是永遠增量的，無害）。
P3 之後若需隔離快取，需在此評估後拆分。

## 生命週期

```
onMount  → new THREE.Scene / SceneDocument / History / SceneSync / WebGLRenderer / Camera / OrbitControls / rAF loop
onCleanup → cancelAnimationFrame → ResizeObserver.disconnect → OrbitControls.dispose → SceneSync.dispose → renderer.dispose → domElement.remove
```
