# #128 備忘錄：移除 deprecated API

## 跨模組遺漏：App.tsx 仍使用 RemoveObjectCommand

**發現**：`src/app/App.tsx:39` 的 Delete 快捷鍵未遷移，在 grep 階段被漏掉。

**根因**：step-5 的 grep 用了 `--include="*.ts"`，沒有包含 `.tsx` 副檔名。
SolidJS / React 專案中業務邏輯常在 `.tsx`，未來 grep 應改為：
```bash
grep -r "..." src/ --include="*.ts" --include="*.tsx"
```
或直接不加 `--include` 讓 ripgrep 自動包含所有文字檔。

**修正方式**（app 模組處理）：
```typescript
// 舊
const obj = editor.sceneSync.getObject3D(uuid);
if (obj) editor.execute(new RemoveObjectCommand(editor, obj));

// 新
editor.execute(new RemoveNodeCommand(editor, uuid));
```

## core 端已完成

1. 刪除 6 個舊 Command 檔案（AddObjectCommand、RemoveObjectCommand、SetPosition/Rotation/Scale/ValueCommand）
2. EventEmitter 移除 4 個 deprecated 事件（objectAdded、objectRemoved、objectChanged、sceneGraphChanged）
3. Editor 移除 3 個 legacy 方法（addObject、removeObject、objectChanged）
4. 測試全部更新（History.test.ts 改用 AddNodeCommand/RemoveNodeCommand）

build 待 app 模組修復後再跑。
