import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.ai/audits/context');
const DEV_URL = 'http://localhost:3000';

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    console.error(`[audit:context] Dev server not reachable at ${DEV_URL}.`);
    console.error('Please run `npm run dev` in another terminal first.');
    process.exit(1);
  }
}

async function main() {
  await ensureDevServer();
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await page.goto(DEV_URL, { waitUntil: 'networkidle' });

  // 確保 Scene tab 啟用（scene-tree 可見）
  await page.getByText('Scene', { exact: true }).click();
  await page.waitForTimeout(200);

  // 加一個 Cube（tree 有 row 才能測「有選取」狀態）
  await page.getByRole('button', { name: '+ Cube' }).click();
  await page.waitForTimeout(300);

  // ── 1. menu-no-selection.png ─────────────────────────────────────────
  // 點空白處取消選取，再右鍵空白區
  await page.mouse.click(200, 400, { button: 'left' });
  await page.waitForTimeout(100);
  await page.mouse.click(200, 400, { button: 'right' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(OUT_DIR, 'menu-no-selection.png'), type: 'png' });

  // 關閉 menu
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // ── 2. menu-with-selection.png ───────────────────────────────────────
  // 左鍵選取 Cube row，再右鍵同一 row
  const cubeRow = page.getByText('BCube').first();
  await cubeRow.click();
  await page.waitForTimeout(150);
  await cubeRow.click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(OUT_DIR, 'menu-with-selection.png'), type: 'png' });

  // ── 3. menu-item-hover.png ───────────────────────────────────────────
  // menu 已展開，hover "Delete" item
  await page.getByText('Delete').hover();
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(OUT_DIR, 'menu-item-hover.png'), type: 'png' });

  // ── 4. menu-submenu.png ──────────────────────────────────────────────
  // hover "Create Primitive" 展開 submenu（不 click）
  await page.getByText('Create Primitive').hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(OUT_DIR, 'menu-submenu.png'), type: 'png' });

  // ── 5. menu-disabled.png ─────────────────────────────────────────────
  // 關閉目前 menu，重新開啟，截 Paste 行（disabled 樣式）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await cubeRow.click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.getByText('Paste').hover();
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(OUT_DIR, 'menu-disabled.png'), type: 'png' });

  // 收尾
  await page.keyboard.press('Escape');
  await browser.close();
  console.log(`[audit:context] 5 screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[audit:context] failed:', err);
  process.exit(1);
});
