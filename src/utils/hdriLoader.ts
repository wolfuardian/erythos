import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { DataTexture } from 'three';

/**
 * 從 URL 載入 .hdr 檔案，返回 DataTexture。
 * PMREMGenerator 處理交由 ShadingManager（它有 renderer reference）。
 */
export async function loadHDRI(url: string): Promise<DataTexture> {
  const loader = new RGBELoader();
  return loader.loadAsync(url);
}
