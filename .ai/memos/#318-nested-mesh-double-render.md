# #318 備忘錄：巢狀 Mesh 重複渲染潛在問題

在追查 #318 雙層 scale 時，發現一個相關但不同的問題值得後續開 issue。

## 問題描述

若 glb 內部有巢狀 Mesh 結構，例如：
- Arm（Mesh）→ Hand（Mesh）

`gltfConverter` 會為每個 Object3D（包含 Arm、Hand）各自建立 SceneNode，且每個 Mesh 節點的 SceneNode 都有 `mesh` component。

在 `SceneSync.onNodeAdded` 中：
1. Arm SceneNode 建 `obj_arm`，呼叫 `cloneSubtree(filePath, "Arm")` → clone 出 Arm 加其子孫 Hand → `meshObj_arm` 掛到 `obj_arm`
2. Hand SceneNode 建 `obj_hand`，呼叫 `cloneSubtree(filePath, "Arm|Hand")` → clone 出獨立的 Hand → `meshObj_hand` 掛到 `obj_hand`
3. `obj_hand` 是 `obj_arm` 的子節點（場景樹依父子關係連結）

結果：`obj_arm` 底下同時有：
- `meshObj_arm`（含 Hand 的深度 clone）
- `obj_hand` + `meshObj_hand`（Hand 的另一份）

Hand 會在場景中出現兩次。

## 影響評估

- #318 修正後，這個問題在視覺上仍存在（Hand 重複渲染）
- 目前 erythos 匯入的 glb 若都是「root + 單層 mesh 子節點」則不觸發
- 真正的複雜藝術家資產（骨架、多層 LOD）會遇到此問題

## 建議

後續開獨立 issue。可能方案：
- `gltfConverter` 只為最深層的 Mesh（leaf Mesh）建立 mesh component，非 Mesh 的 Group 不建
- 或 `cloneSubtree` 改為淺 clone（只 clone 自身，不帶子孫），讓 SceneSync 的場景樹處理子孫
