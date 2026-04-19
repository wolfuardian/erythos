import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.claude/audits/environment');
const DEV_URL = 'http://localhost:3000';

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch (err) {
    console.error(`[audit:environment] Dev server not reachable at ${DEV_URL}.`);
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

  await page.goto(DEV_URL, { waitUntil: 'networkidle' });

  // Switch to Environment tab. Dockview tabs have class `.dv-default-tab-content` (no ARIA role).
  // Filter by hasText to avoid matching the panel header which also contains "Environment".
  await page.locator('.dv-default-tab-content', { hasText: 'Environment' }).first().click();
  await page.waitForTimeout(300);

  // Dockview panel content container; filter by HDR Image text (unique to Environment panel).
  const panel = page.locator('.dv-content-container').filter({ hasText: 'HDR Image' });

  // overview.png: default state (HDR Image label, Intensity slider, Rotation slider)
  await panel.screenshot({ path: resolve(OUT_DIR, 'overview.png'), type: 'png' });

  // hover-intensity.png: hover over the Intensity range input (first range in panel)
  const intensitySlider = panel.locator('input[type="range"]').first();
  await intensitySlider.hover();
  await page.waitForTimeout(100);
  await panel.screenshot({ path: resolve(OUT_DIR, 'hover-intensity.png'), type: 'png' });

  await browser.close();
  console.log(`[audit:environment] 2 screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[audit:environment] failed:', err);
  process.exit(1);
});
