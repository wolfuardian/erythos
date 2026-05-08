/**
 * sha256 — thin wrapper around crypto.subtle.digest.
 *
 * Returns a 64-character lowercase hex string (SHA-256 of the given ArrayBuffer).
 * Available in all modern browsers and Node 19+ (or Node 18 with --experimental-global-webcrypto).
 */
export async function sha256(buffer: ArrayBuffer): Promise<string> {
  // Pass as Uint8Array to ensure compatibility across all environments
  // (jsdom / browsers / Node — all accept TypedArray).
  const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer));
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
