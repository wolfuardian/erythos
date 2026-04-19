import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.claude/audits/settings');
const DEV_URL = 'http://localhost:3000';

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch (err) {
    console.error(`[audit:settings] Dev server not reachable at ${DEV_URL}.`);
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

  // Switch to Settings tab.
  // Dockview tabs use class `.dv-default-tab-content` — no ARIA role, no data-view-id.
  await page.locator('.dv-default-tab-content', { hasText: 'Settings' }).first().click();
  await page.waitForTimeout(300);

  // Locate Settings panel content container via unique inner text.
  // "Confirm before loading scene" is unique to this panel.
  // Fallback: if locator is unstable, full-page screenshot is acceptable.
  const panel = page.locator('.dv-content-container').filter({ hasText: 'Confirm before loading scene' });

  // overview.png: panel default state
  await panel.screenshot({ path: resolve(OUT_DIR, 'overview.png'), type: 'png' });

  // checkbox-hover.png: hover over the checkbox
  const checkbox = panel.locator('input[type="checkbox"]').first();
  await checkbox.hover();
  await page.waitForTimeout(100);
  await panel.screenshot({ path: resolve(OUT_DIR, 'checkbox-hover.png'), type: 'png' });

  await browser.close();
  console.log(`[audit:settings] 2 screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[audit:settings] failed:', err);
  process.exit(1);
});
