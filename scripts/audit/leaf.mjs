import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.ai/audits/leaf');
const DEV_URL = 'http://localhost:3000';

const FIXTURE_ASSETS = [
  {
    version: 1,
    id: 'fixture-leaf-1',
    name: 'Fixture Leaf A',
    modified: new Date().toISOString(),
    nodes: [
      { localId: 0, parentLocalId: null, name: 'Root', order: 0,
        position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], components: {} },
    ],
  },
  {
    version: 1,
    id: 'fixture-leaf-2',
    name: 'Fixture Leaf B',
    modified: new Date().toISOString(),
    nodes: [
      { localId: 0, parentLocalId: null, name: 'Root', order: 0,
        position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], components: {} },
    ],
  },
];

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    console.error('[audit:leaf] Dev server not reachable at ' + DEV_URL + '.');
    console.error('Please run `npm run dev` in another terminal first.');
    process.exit(1);
  }
}

/** IndexedDB に fixture を注入（reload 前に呼ぶ） */
async function injectFixtures(page, assets) {
  await page.evaluate(async (assetsJson) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('erythos-leaf', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('assets');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('assets', 'readwrite');
        const store = tx.objectStore('assets');
        for (const asset of assetsJson) {
          store.put(JSON.stringify(asset), asset.id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, assets);
}

async function main() {
  await ensureDevServer();
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // ── Round 1：empty state ──────────────────────────────────────────────────
  await page.goto(DEV_URL, { waitUntil: 'networkidle' });

  await page.locator('.dv-default-tab-content', { hasText: 'Leaves' }).first().click();
  await page.waitForTimeout(300);

  // empty-state: 嘗試 panel locator，失敗則 fallback 全頁
  try {
    const emptyPanel = page.locator('.dv-content-container').filter({ hasText: 'No leaves saved.' });
    await emptyPanel.waitFor({ timeout: 3000 });
    await emptyPanel.screenshot({ path: resolve(OUT_DIR, 'empty-state.png'), type: 'png' });
  } catch {
    console.warn('[audit:leaf] empty-state panel locator unstable, falling back to full page');
    await page.screenshot({ path: resolve(OUT_DIR, 'empty-state.png') });
  }

  // ── Round 2：注入 fixture → reload ────────────────────────────────────────
  await injectFixtures(page, FIXTURE_ASSETS);
  await page.reload({ waitUntil: 'networkidle' });

  await page.locator('.dv-default-tab-content', { hasText: 'Leaves' }).first().click();
  await page.waitForTimeout(300);

  // overview: 有 2 個 item，無選中
  try {
    const panel = page.locator('.dv-content-container').filter({ hasText: 'Leaves (2)' });
    await panel.waitFor({ timeout: 3000 });

    await panel.screenshot({ path: resolve(OUT_DIR, 'overview.png'), type: 'png' });

    // hover 第一個 item
    const firstItem = panel.locator('div[draggable]').first();
    await firstItem.hover();
    await page.waitForTimeout(150);
    await panel.screenshot({ path: resolve(OUT_DIR, 'hover.png'), type: 'png' });

    // click 第一個 item → selected
    await firstItem.click();
    await page.waitForTimeout(150);
    await panel.screenshot({ path: resolve(OUT_DIR, 'selected.png'), type: 'png' });

  } catch {
    console.warn('[audit:leaf] panel locator unstable after reload, falling back to full page');
    await page.screenshot({ path: resolve(OUT_DIR, 'overview.png') });
    const firstItem = page.locator('div[draggable]').first();
    await firstItem.hover();
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(OUT_DIR, 'hover.png') });
    await firstItem.click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(OUT_DIR, 'selected.png') });
  }

  await browser.close();
  console.log('[audit:leaf] 4 screenshots written to ' + OUT_DIR);
}

main().catch((err) => {
  console.error('[audit:leaf] failed:', err);
  process.exit(1);
});
