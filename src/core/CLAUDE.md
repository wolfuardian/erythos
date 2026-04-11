# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] SceneNode 型別定義（#81）
  - 修改 `src/core/scene/SceneFormat.ts`：
    - 移除現有的 `SceneMetadata` 和 `SceneFormat` interface（舊的過渡設計）
    - 新增以下型別（依 `.ai/scene-format-spec.md` §6）：
      ```typescript
      export type Vec3 = [number, number, number];
      
      export interface SceneNode {
        id: string;          // UUID v4
        name: string;
        parent: string | null; // parent UUID
        order: number;
        position: Vec3;
        rotation: Vec3;
        scale: Vec3;
        components: Record<string, unknown>;
        userData: Record<string, unknown>;
      }
      
      export interface MeshComponent {
        source: string;
      }
      
      export interface SceneFile {
        version: number;
        nodes: SceneNode[];
      }
      ```
    - 確認移除舊型別後，如有其他檔案 import 舊型別 → 修正或移除（目前 SceneLoader.ts 有自己的型別定義，不受影響）

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307

## Git 規則
- 工作分支：feat/scene-node-types
- commit 訊息格式：`[core] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[core] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
