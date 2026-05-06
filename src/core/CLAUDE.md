# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 慣例
- 遵循現有 Command 模式（參考 AddNodeCommand.ts）
- Command 直接操作 SceneDocument（addNode/removeNode/updateNode），不透過 Editor wrapper
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307
- AutoSave 寫 project file (`scenes/scene.erythos`)，不寫 localStorage
- 可用 solid-js reactive primitive（`createSignal` / `createMemo` / `createEffect` / `createRoot`）作 first-class observable；**禁止** import JSX、DOM API、`solid-js/web`、`solid-js/store`（store 是 UI 慣用模式，core 用 signal 即可）
