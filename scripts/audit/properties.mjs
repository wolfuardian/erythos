import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.ai/audits/properties');
const DEV_URL = 'http://localhost:3000';

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    console.error(`[audit:properties] Dev server not reachable at ${DEV_URL}.`);
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
  // Left group:  Scene / Project / Context / Leaves  (Scene active by default as first-added)
  // Right group: Properties / Settings / Environment (Environment last-added, may be active)
  // → Must explicitly click "Properties" tab before screenshotting.
  await page.goto(DEV_URL, { waitUntil: 'networkidle' });

  // Step 1: Activate Scene tab (left group) to show toolbar
  await page.getByText('Scene', { exact: true }).click();
  await page.waitForTimeout(200);

  // Step 2: Add a Cube via toolbar (need a selectable node)
  await page.getByRole('button', { name: '+ Cube' }).click();
  await page.waitForTimeout(300);

  // Step 3: Activate Properties tab (right group)
  // Dockview tabs have class `.dv-default-tab-content` (no ARIA role).
  // Filter by hasText to avoid matching the panel header which also contains "Properties".
  await page.locator('.dv-default-tab-content', { hasText: 'Properties' }).first().click();
  await page.waitForTimeout(200);

  // ── overview.png ─────────────────────────────────────────────────────
  // State: nothing selected → panel shows "No object selected"
  // Full-page screenshot is the safest locator since panel content changes per state.
  await page.screenshot({ path: resolve(OUT_DIR, 'overview.png'), type: 'png' });

  // Step 4: Click Cube row in scene-tree (left group still visible)
  // "BCube" = icon letter "B" + label "Cube" (same pattern as scene-tree.mjs)
  const cubeRow = page.getByText('BCube');
  await cubeRow.click();
  // Wait for SolidJS createEffect to propagate → Properties panel re-renders
  await page.waitForTimeout(300);

  // ── selected.png ──────────────────────────────────────────────────────
  // State: single Cube selected → panel shows Object section + Transform section
  await page.screenshot({ path: resolve(OUT_DIR, 'selected.png'), type: 'png' });

  // Step 5: Focus the Name input in the Object section
  // TransformDraw uses number inputs; ObjectDraw has the only textbox (Name field)
  const nameInput = page.getByRole('textbox').first();
  await nameInput.focus();
  await page.waitForTimeout(100);

  // ── input-focus.png ───────────────────────────────────────────────────
  // State: Name input focused → captures focus ring / highlight style
  await page.screenshot({ path: resolve(OUT_DIR, 'input-focus.png'), type: 'png' });

  await browser.close();
  console.log(`[audit:properties] 3 screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[audit:properties] failed:', err);
  process.exit(1);
});
