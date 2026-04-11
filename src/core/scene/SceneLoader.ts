// TEMP: 暫時型別定義 — 待 #34 (SceneFormat.ts) merge 後對齊，屆時改為 import

export interface SceneObjectData {
  uuid: string;
  name: string;
  type: string;
  position: [number, number, number];
  rotation: [number, number, number, string]; // [x, y, z, order]
  scale: [number, number, number];
  visible: boolean;
  children: SceneObjectData[];
  userData?: Record<string, unknown>;
}

export interface SceneData {
  version: number; // 目前為 1
  scene: SceneObjectData;
}

// ── Vite dev-server FS plugin 端點（約定路徑）──────────

const FS_READ_URL  = '/_erythos/fs/read';
const FS_WRITE_URL = '/_erythos/fs/write';

// ── In-memory mock 儲存（Vite server 不可用時的 fallback）──

const _mockStorage = new Map<string, string>();

// ── 內部 helpers ───────────────────────────────────────

async function _serverRead(path: string): Promise<string> {
  const url = `${FS_READ_URL}?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FS server read failed (${res.status}): ${path}`);
  return res.text();
}

async function _serverWrite(path: string, content: string): Promise<void> {
  const res = await fetch(FS_WRITE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`FS server write failed (${res.status}): ${path}`);
}

// ── Public API ─────────────────────────────────────────

/**
 * 讀取 .scene 檔案並解析為 SceneData。
 *
 * path 為邏輯路徑，格式：runtime/project_{name}/assets/scenes/{file}.scene
 * 優先透過 Vite FS server plugin 讀取；若不可用，回落至 in-memory mock。
 */
export async function loadScene(path: string): Promise<SceneData> {
  try {
    const text = await _serverRead(path);
    return JSON.parse(text) as SceneData;
  } catch (serverErr) {
    const cached = _mockStorage.get(path);
    if (cached !== undefined) {
      return JSON.parse(cached) as SceneData;
    }
    console.warn(
      `[SceneLoader] Vite FS plugin unavailable; no mock data for "${path}".`,
      'Implement /_erythos/fs/read in a Vite plugin to enable real file access.',
      '\nOriginal error:', serverErr,
    );
    throw new Error(`Cannot load scene "${path}": file system not available in this environment.`);
  }
}

/**
 * 將 SceneData 寫入 .scene 檔案（JSON 格式）。
 *
 * 優先透過 Vite FS server plugin 寫入；若不可用，暫存於 in-memory mock。
 */
export async function saveScene(path: string, data: SceneData): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  try {
    await _serverWrite(path, content);
  } catch (serverErr) {
    _mockStorage.set(path, content);
    console.warn(
      `[SceneLoader] Vite FS plugin unavailable; scene saved to mock storage only (path: "${path}").`,
      'Implement /_erythos/fs/write in a Vite plugin to enable real file persistence.',
      '\nOriginal error:', serverErr,
    );
  }
}

/**
 * 僅供測試：將資料直接注入 mock 儲存，模擬預存的 .scene 檔案。
 */
export function _mockInject(path: string, data: SceneData): void {
  _mockStorage.set(path, JSON.stringify(data, null, 2));
}

/**
 * 僅供測試：清除 mock 儲存。
 */
export function _mockClear(): void {
  _mockStorage.clear();
}
