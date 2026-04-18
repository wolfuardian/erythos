import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(REPO_ROOT, '.ai/audits/project');
const DEV_URL = 'http://localhost:3000';

async function ensureDevServer() {
  try {
    const resp = await fetch(DEV_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    console.error(`[audit:project] Dev server not reachable at ${DEV_URL}.`);
    console.error('Please run `npm run dev` in another terminal first.');
    process.exit(1);
  }
}

async function main() {
  await ensureDevServer();
  mkdirSync(OUT_DIR, { recursive: true });

  // ────────────────────────────────────────────────────────────────────
  // SHOT 1 & 2: Hub mode (empty state + with recent projects list)
  // ────────────────────────────────────────────────────────────────────
  {
    const browser = await chromium.launch({ headless: true });
    // Fresh context: no IndexedDB → no recent projects (Hub empty)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(DEV_URL, { waitUntil: 'networkidle' });

    // Activate Project tab (Dockview: no ARIA, must use .dv-default-tab-content)
    await page.locator('.dv-default-tab-content', { hasText: 'Project' }).first().click();
    await page.waitForTimeout(300);

    // ── hub-empty.png ──────────────────────────────────────────────────
    // State: no recent projects → "No recent projects." placeholder
    await page.screenshot({ path: resolve(OUT_DIR, 'hub-empty.png'), type: 'png' });
    console.log('[audit:project] hub-empty.png');

    // Open "New Project" overlay (purely DOM-driven, no file picker yet)
    // Use nth(1) because "New Scene" button also matches name 'New' in toolbar
    await page.getByRole('button', { name: 'New' }).nth(1).click();
    await page.waitForTimeout(200);

    // ── hub-new-overlay.png ─────────────────────────────────────────────
    // State: "New Project" overlay open (form with project name + location)
    await page.screenshot({ path: resolve(OUT_DIR, 'hub-new-overlay.png'), type: 'png' });
    console.log('[audit:project] hub-new-overlay.png');

    await browser.close();
  }

  // ────────────────────────────────────────────────────────────────────
  // SHOTS 3–7: Editor/Browser mode (requires opening a project)
  // Strategy: stub window.showDirectoryPicker in addInitScript to return
  // a pre-populated OPFS handle, bypassing the native file-picker dialog.
  // ────────────────────────────────────────────────────────────────────
  {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    // Patch FileSystemDirectoryHandle prototype so requestPermission/queryPermission
    // always returns 'granted'. This is required for openRecent() to succeed in headless.
    // Also stub showDirectoryPicker to return a pre-populated OPFS handle.
    await page.addInitScript(() => {
      // Patch prototype (must be on prototype — instance patches get dropped by structured clone)
      FileSystemDirectoryHandle.prototype.queryPermission =
        async function () { return 'granted'; };
      FileSystemDirectoryHandle.prototype.requestPermission =
        async function () { return 'granted'; };

      window.showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory();

        // Create standard project subfolder structure
        const subfolders = ['scenes', 'models', 'textures', 'hdris', 'leaves', 'other'];
        for (const name of subfolders) {
          await root.getDirectoryHandle(name, { create: true });
        }

        // Helper: write a tiny dummy file into a subfolder
        const writeFile = async (folder, filename, content) => {
          const dir = await root.getDirectoryHandle(folder, { create: true });
          const fh = await dir.getFileHandle(filename, { create: true });
          const w = await fh.createWritable();
          await w.write(content);
          await w.close();
        };

        // Populate with mock assets (one per type so filter bar shows all)
        await writeFile('scenes',   'demo-scene.json',    '{"version":1,"nodes":[]}');
        await writeFile('models',   'rock.glb',           'GLB');
        await writeFile('models',   'tree.glb',           'GLB');
        await writeFile('textures', 'wood.png',           'PNG');
        await writeFile('hdris',    'sky.hdr',            'HDR');
        await writeFile('leaves',   'maple.leaf.json',    '{}');
        await writeFile('other',    'notes.txt',          'notes');

        return root;
      };
    });

    await page.goto(DEV_URL, { waitUntil: 'networkidle' });

    // Activate Project tab
    await page.locator('.dv-default-tab-content', { hasText: 'Project' }).first().click();
    await page.waitForTimeout(300);

    // Step 1: Click "Add" → triggers addFromDisk() → calls stubbed showDirectoryPicker()
    // → saves project to recent list (does NOT open the project directly)
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(1500); // Wait for recent list to refresh

    // Step 2: Click the recent project row to call openRecent() → sets _handle →
    // projectOpen() becomes true → UI flips to Browser/Editor mode.
    // Row: div with gap:8px + cursor:pointer (avoids the × remove button inside)
    const projectRow = page.locator('div[style*="gap:8px"][style*="cursor:pointer"]').first();
    await projectRow.click({ position: { x: 10, y: 10 } });
    // Wait for filter buttons to confirm editor mode is active
    await page.waitForSelector('[aria-label="Scene"]', { timeout: 10000 });
    await page.waitForTimeout(300);

    // ── editor-overview.png ─────────────────────────────────────────────
    // State: Browser/Editor mode, all filters active, 7 assets visible
    await page.screenshot({ path: resolve(OUT_DIR, 'editor-overview.png'), type: 'png' });
    console.log('[audit:project] editor-overview.png');

    // ── filter-scene-only.png ───────────────────────────────────────────
    // State: only Scene filter active (click all non-scene to deactivate)
    // Use aria-label selector directly (more reliable than getByRole in Dockview context)
    const filterTypesToHide = ['Model', 'Texture', 'HDRI', 'Leaf', 'Other'];
    for (const label of filterTypesToHide) {
      await page.locator(`[aria-label="${label}"]`).click();
      await page.waitForTimeout(100);
    }
    await page.screenshot({ path: resolve(OUT_DIR, 'filter-scene-only.png'), type: 'png' });
    console.log('[audit:project] filter-scene-only.png');

    // ── filter-model-only.png ────────────────────────────────────────────
    // State: only Model filter active
    await page.locator('[aria-label="Scene"]').click();   // disable Scene
    await page.waitForTimeout(100);
    await page.locator('[aria-label="Model"]').click();   // enable Model
    await page.waitForTimeout(100);
    await page.screenshot({ path: resolve(OUT_DIR, 'filter-model-only.png'), type: 'png' });
    console.log('[audit:project] filter-model-only.png');

    // Re-enable all filters for remaining shots
    const allTypesToShow = ['Scene', 'Texture', 'HDRI', 'Leaf', 'Other'];
    for (const label of allTypesToShow) {
      await page.locator(`[aria-label="${label}"]`).click();
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(200);

    // ── asset-selected.png ───────────────────────────────────────────────
    // State: GLB asset "rock.glb" selected (bg-selected highlight)
    await page.getByText('rock.glb').click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(OUT_DIR, 'asset-selected.png'), type: 'png' });
    console.log('[audit:project] asset-selected.png');

    // ── asset-hover.png ───────────────────────────────────────────────────
    // State: GLB asset "tree.glb" hovered
    await page.getByText('rock.glb').click();       // deselect rock.glb first
    await page.waitForTimeout(100);
    await page.getByText('tree.glb').hover();
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(OUT_DIR, 'asset-hover.png'), type: 'png' });
    console.log('[audit:project] asset-hover.png');

    await browser.close();
  }

  console.log(`[audit:project] 7 screenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[audit:project] failed:', err);
  process.exit(1);
});
