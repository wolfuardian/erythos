import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.ai/audits/scene-tree');
const DEV_URL = 'http://localhost:3000';

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch (err) {
    console.error(`[audit:scene-tree] Dev server not reachable at ${DEV_URL}.`);
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

  // Switch to Scene tab
  await page.getByText('Scene', { exact: true }).click();

  // Add 5 objects via toolbar
  await page.getByRole('button', { name: '+ Cube' }).click();
  await page.getByRole('button', { name: '+ Sphere' }).click();
  await page.getByRole('button', { name: '+ Camera' }).click();
  await page.getByRole('button', { name: '+ Group' }).click();
  await page.getByRole('button', { name: '+ Light' }).click();

  // Stabilize
  await page.waitForTimeout(300);

  // Locate Scene Tree panel (header "Scene" + 5 tree rows)
  const panel = page.getByText('SceneBCubeSSphereCCameraGGroupLDirectional Light');

  // overview.png
  await panel.screenshot({ path: resolve(OUT_DIR, 'overview.png'), type: 'png' });

  // hover Cube row → hover.png
  const cubeRow = page.getByText('BCube');
  await cubeRow.hover();
  await page.waitForTimeout(100);
  await panel.screenshot({ path: resolve(OUT_DIR, 'hover.png'), type: 'png' });

  // click Cube row → selected.png
  await cubeRow.click();
  await page.waitForTimeout(100);
  await panel.screenshot({ path: resolve(OUT_DIR, 'selected.png'), type: 'png' });

  await browser.close();
  console.log(`[audit:scene-tree] 3 screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[audit:scene-tree] failed:', err);
  process.exit(1);
});
