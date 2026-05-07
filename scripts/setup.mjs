#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * scripts/setup.mjs — fresh-clone / cross-machine onboarding helper
 *
 * 用途:`git clone` 到新電腦、或 pull 到新增/移除依賴的 commit 時,一鍵把環境裝齊。
 *
 *   1. 檢查 Node 版本(vite 8 / typescript 6 需 ≥ 20)
 *   2. `npm install`(用 lockfile 還原 node_modules)
 *   3. `npm run build`(verify 環境真能 compile)
 *   4. 印下一步
 *
 * Usage:
 *   node scripts/setup.mjs
 *   npm run setup
 *
 * Exit 0 — 環境就緒
 * Exit 1 — 某個步驟失敗(訊息會清楚指出哪一步)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MIN_NODE_MAJOR = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Spawn a command, inheriting stdio so user sees full progress.
 * Returns a promise that resolves on exit 0, rejects otherwise.
 */
function run(cmd, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      // Windows needs shell:true so `npm` resolves to npm.cmd
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (exit ${code})`));
    });
    child.on('error', (err) => reject(new Error(`${label} could not start: ${err.message}`)));
  });
}

function checkNode() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  if (major < MIN_NODE_MAJOR) {
    console.error(`✗ Node ${process.versions.node} too old. Need ≥ ${MIN_NODE_MAJOR}.`);
    console.error(`  Install latest LTS: https://nodejs.org/`);
    process.exit(1);
  }
  console.log(`  Node ${major}.${minor}.${patch} ✓`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('▶ Checking Node version');
  checkNode();

  console.log('\n▶ Installing dependencies (npm install)');
  await run('npm', ['install'], 'npm install');

  console.log('\n▶ Verifying build (npm run build)');
  await run('npm', ['run', 'build'], 'npm run build');

  console.log('\n✓ Setup complete. Next steps:');
  console.log('    npm run dev     # start vite dev server');
  console.log('    npm run check   # run command-pattern + panel-root contracts');
  console.log('    npm test        # run vitest');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
