import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type ParserFn = (buffer: ArrayBuffer, path: string) => Promise<{ scene: Group }>;

// Module-level injectable parser — replaced in tests to avoid WebGL dependency
let _injectedParser: ParserFn | null = null;

function getParser(): ParserFn {
  if (_injectedParser) return _injectedParser;
  const loader = new GLTFLoader();
  return (buffer, path) => loader.parseAsync(buffer, path);
}

/** 僅供測試：注入自訂 parser，取代 GLTFLoader。 */
export function _mockParser(fn: ParserFn): void {
  _injectedParser = fn;
}

/** 僅供測試：清除注入的 parser，恢復使用 GLTFLoader。 */
export function _clearParser(): void {
  _injectedParser = null;
}

/**
 * ResourceCache — 記憶體內 GLB/GLTF 快取。
 *
 * 快取鍵為 URL（blob: URL）。
 * page reload 後清空（已知限制）。
 *
 * P1b migration: cache is now URL-keyed. GlbStore integration removed.
 * Scene persistence uses path (not URL); URL is recomputed via projectManager.urlFor(path) at load.
 */
export class ResourceCache {
  private readonly cache = new Map<string, Group>();

  /**
   * Fetch a blob URL, parse the GLB/GLTF, and cache under that URL.
   * If the same URL is already cached, returns the cached entry without re-fetching.
   */
  async loadFromURL(url: string): Promise<Group> {
    const existing = this.cache.get(url);
    if (existing) return existing;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[ResourceCache] fetch failed for URL ${url}: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return this.loadFromBuffer(url, buffer);
  }

  /**
   * 解析 ArrayBuffer 並以 url 為快取鍵存入快取。
   * 若同一 url 已快取，會以新結果覆寫。
   *
   * Kept public: external callers may pass a pre-fetched ArrayBuffer.
   */
  async loadFromBuffer(url: string, buffer: ArrayBuffer): Promise<Group> {
    const parser = getParser();
    const gltf = await parser(buffer, '');
    this.cache.set(url, gltf.scene);
    return gltf.scene;
  }

  /**
   * 從快取中 clone 子樹並回傳。
   *
   * @param url      blob URL（快取鍵）
   * @param nodePath 可選；`|` 分隔的逐層路徑（如 `"Body|Arm|Hand"`），省略時 clone 整個 scene root
   * @returns 淺 clone 的 Object3D（不含子孫），快取未命中或節點不存在時回傳 null
   */
  cloneSubtree(url: string, nodePath?: string): Object3D | null {
    const root = this.cache.get(url);
    if (!root) return null;

    if (!nodePath) return root.clone(false);

    const target = findByPath(root, nodePath);
    return target ? target.clone(false) : null;
  }

  /** 檢查 url 是否已在快取中。 */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /** 移除快取中的特定 url；url 不存在時為 no-op。 */
  evict(url: string): void {
    this.cache.delete(url);
  }

  /** 清除所有快取項目。 */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * 按 `|` 分隔的路徑逐層導航：每個 segment 在當前節點的直接 children 中比對名稱。
 * 例如 `"Body|Arm|Hand"` → root.children 找 Body → Body.children 找 Arm → Arm.children 找 Hand。
 */
function findByPath(root: Object3D, nodePath: string): Object3D | null {
  const segments = nodePath.split('|');
  let current: Object3D = root;
  for (const segment of segments) {
    const child = current.children.find(c => c.name === segment);
    if (!child) return null;
    current = child;
  }
  return current;
}
