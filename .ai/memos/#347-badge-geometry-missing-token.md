# #347 — --badge-geometry token 未定義於 theme.css

## 發現

SceneTreePanel.tsx 中 Box/Sphere/Plane/Cylinder 四個 case 使用 `var(--badge-geometry, #f5a623)`，
但 `src/styles/theme.css` 並未定義 `--badge-geometry` token。

theme.css 中定義的 badge token 為：
- --badge-scene: #3a9060
- --badge-mesh: #4a7fbf
- --badge-light: #c0a030
- --badge-camera: #7a5fb0
- --badge-group: #c06020
- --badge-empty: #666666

## 影響

`--badge-geometry` 缺少 token，移除 fallback 會導致 geometry 類 badge 顏色變為空值（顯示為無色）。
因此 #347 任務僅移除已有對應 token 的 fallback（mesh / light / camera），geometry fallback 需保留。

## 建議

可在 master 的 theme.css 補上 `--badge-geometry: #b07830;`（接近 #f5a623 的低飽和版本，對齊現有 palette 風格），
然後後續再移除 SceneTreePanel 的 fallback。或直接在 #347 之外另開 issue 處理。
