# Environment 視覺審計報告

審計日期：2026-04-17
截圖：overview（預設總覽狀態）, hover-intensity（hover 強度控制）
整體印象：內容極簡、佈局尚稱工整，但 slider 的粉紅 accent 與整個工業冷灰配色系統格格不入；hover 狀態無視覺回饋；大量空白未處理，整體像 v1 prototype 而非 production 工具。

## 視覺問題

### 字級 / 排版

- [ ] 「HDR Image」標題與「Intensity」/「Rotation」標籤之間的字級差距偏小，主次層級不夠清晰——「HDR Image」雖字重稍粗但字級看起來與標籤幾乎相同，視覺上難以快速辨認分組標題。
- [ ] 數值「1.00」與「0°」靠右顯示，但與右側面板邊緣的距離看起來非常貼近邊緣甚至可能緊貼，缺乏右側呼吸空間。

### 空間節奏

- [ ] 「Intensity」row 和「Rotation」row 的垂直間距偏緊——兩條 slider 幾乎無明顯間隔，視覺上融成一塊，難以快速區分兩個獨立控制項。
- [ ] 整個控制區（「HDR Image」分組）之下有大量未使用空白，佔畫面逾 80%。即便目前只有 HDR Image 一個分組，這個比例會讓 panel 顯得未完成或空洞，缺乏底部邊界感。

### 色彩 / 調性

- [ ] Slider 的填充色與 thumb 色使用鮮豔粉紅（目測接近 #e91e63 / 品紅），未見於 `theme.css` 定義的任何 token（accent 系列為 `--accent-blue: #4a7fbf`、`--accent-red: #c04040` 等工業調）。這個高彩飽和粉紅與整體冷灰工業風調性嚴重衝突，視覺重量過強。
- [ ] 整體面板背景色呈現帶藍調的極深色（目測接近 #0d1117），與 `theme.css` 定義的中性暗灰系（`--bg-app: #1a1a1a`、`--bg-panel: #242424`）色溫明顯不同——偏藍調而非工業中性灰，調性飄移。
- [ ] 兩條 slider 的軌道（未填充段）呈現淡灰白色，對比度在深色背景上雖足夠辨認，但這個亮灰軌道色未對應至 `theme.css` 任何已定義 border 或 bg token，屬色彩孤島。

### 狀態層級

- [ ] Hover 狀態（hover-intensity.png）與預設狀態（overview.png）幾乎無視覺差異——兩張截圖對比後看不出任何 hover 反饋（背景、邊框、文字色均無變化）。使用者拖動前無法確認哪個控制項正在互動，狀態層級完全扁平。
- [ ] Slider thumb（粉紅圓點）沒有明顯的 active/focus 視覺狀態區別，hover 時 thumb 尺寸或光暈等任何視覺暗示均不可見。

### 細節品質

- [ ] 「Rotation」slider 的 thumb 位於最左端，與左側邊距幾乎重疊，thumb 有被左邊裁切的視覺風險（目測 thumb 約一半被切）。
- [ ] 「ENVIRONMENT」panel 頂部標題列的字體為全大寫極小字，與「HDR Image」之間欠缺視覺分隔（分隔線或間距），兩層標題直接相鄰顯得層次不夠果斷。

### 整體感

- [ ] 目前 Environment panel 僅呈現一個分組（HDR Image）、兩個控制項，在 v1 階段內容稀少屬正常，但大量空白與無狀態回饋使整體感停留在 prototype 層級，尚未達到 production 工具軟體的品質感。
- [ ] 粉紅 slider accent 是全畫面最搶眼的元素，且只出現在此 panel；若其他 panel 的 slider 使用不同色，跨 panel 一致性會有問題。
