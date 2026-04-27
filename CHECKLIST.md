# Erythos Public Repo — 執行清單

我已經產出新／改檔案放在這個資料夾。下面是你需要手動完成的步驟。

---

## 一、套用我產出的檔案（必做）

```bash
cd /path/to/erythos

# 1. 覆蓋 README.md
cp /path/to/improvements/README.md ./README.md

# 2. 移動啟動器到 scripts/，刪除 root 的舊版
git mv Erythos.bat scripts/launch.bat   # 注意：先別這樣做，下面有更穩的步驟
```

實際上更乾淨的作法：

```bash
# 1. 用我新版的 launch.bat / launch.sh 覆蓋掉 scripts/ 下的對應位置
cp /path/to/improvements/scripts/launch.bat ./scripts/launch.bat
cp /path/to/improvements/scripts/launch.sh  ./scripts/launch.sh
chmod +x ./scripts/launch.sh

# 2. 移除 root 的舊 .bat
git rm Erythos.bat

# 3. 套用新 README、新 architecture 文件
cp /path/to/improvements/README.md ./README.md
mkdir -p docs
cp /path/to/improvements/docs/architecture.md ./docs/architecture.md

# 4. commit
git add -A
git commit -m "docs: rewrite README, add architecture doc, move launcher to scripts/"
git push
```

---

## 二、需要你判斷的決策點

### 1. CLAUDE.md 的處理

我**沒動** root 的 `CLAUDE.md`。兩個選項，挑一個：

- **A. 留著（大方）** — 我新 README 已經有「How It's Built」段落公開承認這件事。CLAUDE.md 留 root 沒問題，反而誠實一致。**推薦這個。**
- **B. 收進 `.claude/`** —
  ```bash
  git mv CLAUDE.md .claude/CONTEXT.md
  ```
  比較低調。但你現在 README 已經寫了 AI 透明度，這樣做反而矛盾。

### 2. README 的「How It's Built」段落

如果你覺得不想公開這個部分：直接把 `## How It's Built` 整段刪掉即可，其他內容不用改。

### 3. README 的 Why 段落

我用了「opinionated, polished editor for building Three.js scenes on the web」這個定位。如果你覺得太強烈或不準，自由替換。但建議**至少留一段「Why」**，這是現在最缺的。

---

## 三、你需要人力完成的（GitHub UI 或本機操作）

### 必做

- [ ] **拍 hero screenshot**（1600×900 建議），放 `docs/images/hero.png`
- [ ] **README 第一行的 screenshot 路徑** 取消註解（把 `> ![...]` 那兩行的 `>` 拿掉）
- [ ] **錄一段 15–30 秒 GIF**（推薦 [ScreenToGif](https://www.screentogif.com/)），放 `docs/images/demo.gif`
- [ ] 補到 README 的 `## Screenshots` 段落

### 強烈建議

- [ ] **部署 live demo** — Cloudflare Pages 或 Vercel，直接接 GitHub repo，免費
  - Vercel：[https://vercel.com/new](https://vercel.com/new)
  - Cloudflare Pages：[https://dash.cloudflare.com/](https://dash.cloudflare.com/)
  - 部署後把 URL 貼到 README 第一行 `[Live demo](#)` 的 `#`
- [ ] **設 Social Preview 圖**（GitHub repo → Settings → General → Social preview）
  - 1280×640 PNG，分享 repo 連結到 X / Discord / 巴哈時會用
- [ ] **改 default branch 為 `main`**
  - GitHub repo → Settings → Branches → Default branch → 切換按鈕
  - 你目前 0 fork，改名零成本

### 可選

- [ ] 在 `docs/images/` 補 1–2 張 panel close-up（展示你的 UX 細節）
- [ ] README 補一個 `## Roadmap` 段（看你想不想設預期）
- [ ] 之後要中文 README 的話，再開 `README.zh-TW.md` 並在 README 頂部加切換連結

---

## 四、不需要做的事

- 不需要 CHANGELOG（active dev 階段沒意義）
- 不需要 CONTRIBUTING.md（README 已經寫了預期）
- 不需要 Code of Conduct（無社群）
- 不需要 Issue / PR template（流量起來再說）

---

## 五、最後一步：commit message 衛生

從現在開始，commit message 不要寫「Claude 又把 X 寫壞了重做」這種。維持 conventional commits（`feat:` `fix:` `refactor:` `docs:` `chore:`）就好。

之後如果想商業化、被獵頭翻、或寫 devlog，這些紀錄都會被讀。
