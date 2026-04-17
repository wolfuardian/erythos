# Properties 視覺審計報告

審計日期：2026-04-17
截圖：overview（未選中）、selected（選中 Cube）、input-focus（Name 欄聚焦）
整體印象：功能骨架清晰，但整體像 prototype 而非 production——字級階層完全扁平、區塊標題與資料行缺乏呼吸、輸入欄 focus 狀態靠邊框撐場但 unfocus 輸入欄幾乎與背景融合，作為核心編輯入口的視覺存在感明顯不足。

## 視覺問題

### 字級 / 排版

- [ ] `PROPERTIES`、`OBJECT`、`TRANSFORM` 這三層 section 標題使用相同字級，主次沒有區分：panel 標題（PROPERTIES）、分組大標（OBJECT / TRANSFORM）、欄位標籤（Name / Position / Rotation / Scale）幾乎是同一視覺重量，視線沒有清晰的落點層次。
- [ ] 欄位標籤（Name、Type、Position…）與輸入值（Cube、Box、0、1）字重相同，查看屬性時無法一眼辨識「哪是 label、哪是值」。
- [ ] X / Y / Z 軸前綴字母（紅/藍/黃色）雖有色彩暗示，但尺寸偏小（目測與數值等大），沒有作為次要提示縮小的設計感。

### 空間節奏

- [ ] `OBJECT` 與 `TRANSFORM` 分組之間的垂直間距和行內間距幾乎相同，分組邊界不夠清晰，閱讀節奏平板——視線從 Name/Type 移到 Position 沒有停頓感。
- [ ] Position / Rotation / Scale 的 label 行與三欄輸入欄幾乎緊貼，上下 padding 目測約 2–3px，喘不過氣；與 theme token `--space-md: 8px` 的期待落差明顯。
- [ ] 三欄輸入欄（X / Y / Z）之間的水平間隔非常小，整排數字視覺上擠在一塊，難以快速辨識個別軸的值。
- [ ] overview 的「No object selected」置中文字雖然位置正確，但在大片空白中孤立感強，缺乏任何輔助的視覺節奏（如圖示、分隔線提示）。

### 色彩 / 調性

- [ ] 輸入欄在 unfocus 狀態下（selected 截圖）背景與面板底色差異極小，幾乎辨識不出「這是一個可輸入的欄位」——對照 theme：`--bg-input: #1e1e1e`、`--bg-panel: #242424`，差距僅 6 個灰度單位，目測幾乎融合。
- [ ] `OBJECT` / `TRANSFORM` 分組標題（全大寫）與後方背景無任何視覺區分（無色彩、無底色、無邊線），在深色面板中字色對比雖夠但無層次感，與 theme 中存在的 `--bg-header: #333333` 未利用。
- [ ] Type 欄的值「Box」與 Name 欄的值「Cube」使用相同文字色，但 Type 屬性通常為唯讀，視覺上無法與可編輯欄（Name）區分。

### 狀態層級

- [ ] unfocus 輸入欄（Position / Rotation / Scale 各欄）沒有任何明顯邊框或底色差異，可點擊可編輯的欄位視覺上與靜態文字無異，使用者需要靠嘗試才知道能否輸入。
- [ ] focus 狀態（input-focus 截圖）的 Name 欄出現白色邊框，是目前唯一清晰的狀態層級標記，但這個邊框色彩（白色）與 theme 定義的 `--border-focus: var(--accent-blue)` 不吻合，focus 色調違反設計 token 系統。
- [ ] 三個 Transform 子區塊（Position / Rotation / Scale）的 unfocus 輸入欄在 selected 截圖中缺乏 hover 或可互動的視覺暗示，整排數字看起來像靜態展示而非可編輯欄位。

### 細節品質

- [ ] X / Y / Z 軸色彩前綴與後方數值之間的對齊方式在三欄中不一致：X 值距離前綴的留白目測比 Y / Z 略大，三欄節奏不均。
- [ ] `PROPERTIES` panel 標題與其下第一個分組標題 `OBJECT` 之間缺乏分隔線或足夠的垂直留白，兩者像是黏在一起。
- [ ] overview 的 `PROPERTIES` 標題行（灰色細字全大寫）字級過小（目測接近 `--font-size-sm: 10px`），在深色背景中對比偏弱，像輔助說明字而非區域標題。

### 整體感

- [ ] 整個 panel 目前呈現清單感而非編輯器感——分組標題、欄位、輸入欄使用同一套密度與視覺權重，缺少 production 3D 軟體（如 Blender Properties / Unity Inspector）常見的「行距層次 + 輸入欄視覺強調」組合。
- [ ] 空白狀態（overview）整個 panel 空間除了 `PROPERTIES` 標題和「No object selected」外完全空置，缺乏任何空狀態設計感，像是功能未完成的畫面。
