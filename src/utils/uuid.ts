/**
 * 產生符合 RFC 4122 v4 的 UUID。
 * 優先使用 `crypto.randomUUID()`（所有現代瀏覽器 / Node 均可用）；
 * 若 API 不存在（極舊環境 / jsdom）則以 Math.random() fallback。
 */
export function generateUUID(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  // Math.random fallback（v4 格式）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
