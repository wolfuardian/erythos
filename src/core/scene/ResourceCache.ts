import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as GlbStore from './GlbStore';

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
 * 快取鍵為 filePath（不含 nodePath）。
 * page reload 後清空（已知限制）。
 */
export class ResourceCache {
  private readonly cache = new Map<string, Group>();

  /**
   * 解析 ArrayBuffer 並以 source（filePath）為快取鍵存入快取。
   * 若同一 source 已快取，會以新結果覆寫。
   */
  async loadFromBuffer(source: string, buffer: ArrayBuffer): Promise<Group> {
    const parser = getParser();
    const gltf = await parser(buffer, '');
    this.cache.set(source, gltf.scene);
    // Fire-and-forget: persist buffer to IndexedDB for cross-reload recovery.
    GlbStore.put(source, buffer).catch(err =>
      console.warn('[ResourceCache] GlbStore.put failed:', err)
    );
    return gltf.scene;
  }

  /**
   * 從 IndexedDB 讀取所有已存的 GLB buffer，解析後填充記憶體快取。
   * 應在 autosave restore 前呼叫，確保 SceneSync rebuild 時 mesh 已就位。
   */
  async hydrate(): Promise<void> {
    let allKeys: string[];
    try {
      allKeys = await GlbStore.keys();
    } catch (err) {
      console.warn('[ResourceCache] hydrate: failed to read IndexedDB keys:', err);
      return;
    }
    console.log(`[ResourceCache] hydrate: restoring ${allKeys.length} GLB(s) from IndexedDB`);
    const parser = getParser();
    for (const source of allKeys) {
      try {
        const buffer = await GlbStore.get(source);
        if (!buffer) continue;
        const gltf = await parser(buffer, '');
        this.cache.set(source, gltf.scene);
        console.log(`[ResourceCache] hydrate: restored "${source}"`);
      } catch (err) {
        console.warn(`[ResourceCache] hydrate: failed to restore "${source}":`, err);
      }
    }
  }

  /**
   * 從快取中 clone 子樹並回傳。
   *
   * @param source  filePath（快取鍵，不含 nodePath）
   * @param nodePath 可選；深度優先搜尋 name 相符的節點，省略時 clone 整個 scene root
   * @returns 深度 clone 的 Object3D，快取未命中或節點不存在時回傳 null
   */
  cloneSubtree(source: string, nodePath?: string): Object3D | null {
    const root = this.cache.get(source);
    if (!root) return null;

    if (!nodePath) return root.clone(true);

    const target = findByName(root, nodePath);
    return target ? target.clone(true) : null;
  }

  /** 檢查 filePath 是否已在快取中。 */
  has(source: string): boolean {
    return this.cache.has(source);
  }

  /** 移除快取中的特定 source；source 不存在時為 no-op。 */
  evict(source: string): void {
    this.cache.delete(source);
    GlbStore.remove(source).catch(err =>
      console.warn('[ResourceCache] GlbStore.remove failed:', err)
    );
  }

  /** 清除所有快取項目。 */
  clear(): void {
    this.cache.clear();
    GlbStore.clear().catch(err =>
      console.warn('[ResourceCache] GlbStore.clear failed:', err)
    );
  }
}

/** 深度優先搜尋：在 root 子樹中找到第一個 name 相符的節點。 */
function findByName(root: Object3D, name: string): Object3D | null {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}
