import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.ai/audits/viewport');
const DEV_URL = 'http://localhost:3000';

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    console.error(`[audit:viewport] Dev server not reachable at ${DEV_URL}.`);
    console.error('Please run `npm run dev` in another terminal first.');
    process.exit(1);
  }
}

async function main() {
  await ensureDevServer();
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Fresh browserContext → no localStorage → applyDefaultLayout() runs.
  // Viewport panel is typically visible by default in the center/main area.
  await page.goto(DEV_URL, { waitUntil: 'networkidle' });

  // Ensure Viewport tab is active (Dockview: no ARIA role, use .dv-default-tab-content).
  // If "Viewport" tab does not exist in Dockview (it may be the main unlabelled panel),
  // skip this click — the 3D canvas is already in view.
  const viewportTab = page.locator('.dv-default-tab-content', { hasText: 'Viewport' }).first();
  const viewportTabCount = await viewportTab.count();
  if (viewportTabCount > 0) {
    await viewportTab.click();
    await page.waitForTimeout(300);
  } else {
    // No explicit "Viewport" tab found — panel may be unlabelled central area.
    await page.waitForTimeout(300);
  }

  // ── overview.png ─────────────────────────────────────────────────────────
  // State: default Solid mode, nothing selected.
  // Viewport is a WebGL canvas with no unique text → full-page screenshot.
  await page.screenshot({ path: resolve(OUT_DIR, 'overview.png'), type: 'png' });

  // Switch to Scene tab to add a Cube (need a selectable object for gizmo shot).
  // Use .first() to avoid strict-mode violation when "Scene" appears in both tab and panel header.
  await page.getByText('Scene', { exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '+ Cube' }).click();
  await page.waitForTimeout(300);

  // Re-activate Viewport tab (if it exists).
  if (viewportTabCount > 0) {
    await viewportTab.click();
    await page.waitForTimeout(300);
  }

  // ── shading-wire.png ──────────────────────────────────────────────────────
  // Click "Wire" shading button (renders as wireframe).
  await page.getByText('Wire', { exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(OUT_DIR, 'shading-wire.png'), type: 'png' });

  // ── shading-shading.png ───────────────────────────────────────────────────
  // Click "Shading" button (lit shading mode).
  await page.getByText('Shading', { exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(OUT_DIR, 'shading-shading.png'), type: 'png' });

  // ── shading-render.png ────────────────────────────────────────────────────
  // Click "Render" button → opens "Render Effects" floating panel.
  await page.getByText('Render', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT_DIR, 'shading-render.png'), type: 'png' });

  // ── selected-gizmo.png ────────────────────────────────────────────────────
  // Switch back to Solid mode, then select the Cube via Scene tree.
  await page.getByText('Solid', { exact: true }).first().click();
  await page.waitForTimeout(200);

  await page.getByText('Scene', { exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.getByText('BCube').click();
  await page.waitForTimeout(300);

  if (viewportTabCount > 0) {
    await viewportTab.click();
    await page.waitForTimeout(300);
  }

  // Cube selected → gizmo should appear in viewport.
  await page.screenshot({ path: resolve(OUT_DIR, 'selected-gizmo.png'), type: 'png' });

  // ── shading-solid.png ─────────────────────────────────────────────────────
  // Solid mode with selected object (confirm active button highlight).
  await page.screenshot({ path: resolve(OUT_DIR, 'shading-solid.png'), type: 'png' });

  await browser.close();
  console.log('[audit:viewport] 6 screenshots written to ' + OUT_DIR);
}

main().catch((err) => {
  console.error('[audit:viewport] failed:', err);
  process.exit(1);
});
