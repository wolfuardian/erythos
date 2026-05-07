#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * check-panel-root.mjs — enforce Panel anatomy contract (initiatives.md C-P1)
 *
 * Contract:
 *   每個註冊到 Dockview 的 panel 元件,JSX root 必為 `<Panel>`(不是 `<div>` 等)。
 *   Reasoning: 統一 anatomy 讓 panel 可預期、可掃描、可機械替換。
 *
 * Mechanism:
 *   1. 從 src/panels/<dir>/index.ts 找 `component: <PanelName>` 取 dockview-registered panel 清單
 *      (透過 EditorDef 註冊才算 dockview panel — 浮動 overlay 如 RenderSettingsPanel 不算)
 *   2. 對每個 panel,讀 src/panels/<dir>/<PanelName>.tsx
 *   3. 找 component function 的 `return ( \n  <Panel ...` pattern;不存在 → violation
 *
 * Why grep/regex (not AST):
 *   一致 scripts/*.mjs 風格(check-command-pattern.mjs 同)。AST library 非 devDep,引入成本不划算。
 *   Lookahead `(?=[\s/>\n])` 避免誤匹配 `<PanelHeader` / `<PanelContent` 等同前綴元件。
 *
 * Usage:
 *   node scripts/check-panel-root.mjs
 *
 * Exit 0 — all PASS
 * Exit 1 — violations found (listed to stderr)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Discover dockview-registered panels via src/panels/*/index.ts ─────────────

function findRegisteredPanels() {
  const panelsDir = path.join(REPO_ROOT, 'src', 'panels');
  const entries = [];

  for (const dirName of fs.readdirSync(panelsDir)) {
    const dirPath = path.join(panelsDir, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const indexPath = path.join(dirPath, 'index.ts');
    if (!fs.existsSync(indexPath)) continue;

    const src = fs.readFileSync(indexPath, 'utf-8');
    // pattern: `component: <PanelName>,` inside an EditorDef literal
    const match = src.match(/component:\s*([A-Z][A-Za-z0-9]*)\s*,/);
    if (!match) continue;

    const panelName = match[1];
    const tsxPath = path.join(dirPath, `${panelName}.tsx`);
    if (!fs.existsSync(tsxPath)) {
      console.error(`Error: ${dirName}/index.ts references ${panelName} but ${panelName}.tsx not found.`);
      process.exit(1);
    }

    entries.push({ dirName, panelName, tsxPath });
  }

  return entries;
}

// ── Verify root JSX is <Panel> ────────────────────────────────────────────────

// Match `return (` then optional whitespace/newline, then `<Panel` followed by
// whitespace, `>`, `/`, or newline. Lookahead avoids matching `<PanelHeader` etc.
const PANEL_ROOT_RE = /return\s*\(\s*\n\s*<Panel(?=[\s/>\n])/;

function checkPanelRoot(tsxPath) {
  const src = fs.readFileSync(tsxPath, 'utf-8');
  return PANEL_ROOT_RE.test(src);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const panels = findRegisteredPanels();

if (panels.length === 0) {
  console.error('Error: no dockview-registered panels found under src/panels/*/index.ts.');
  process.exit(1);
}

const violations = [];
for (const entry of panels) {
  if (!checkPanelRoot(entry.tsxPath)) {
    violations.push(entry);
  }
}

if (violations.length === 0) {
  console.log(`All ${panels.length} dockview panels use <Panel> as root JSX ✓`);
  for (const { dirName, panelName } of panels) {
    console.log(`  ✓ ${dirName}/${panelName}.tsx`);
  }
  process.exit(0);
}

console.error(`Panel root violations found: ${violations.length}\n`);
for (const v of violations) {
  const rel = path.relative(REPO_ROOT, v.tsxPath).replaceAll('\\', '/');
  console.error(`  ✗ ${rel}`);
  console.error(`    expected: component must return ( <Panel ...> ... </Panel> )`);
  console.error(`    fix: import { Panel } from '../../components/Panel'; replace root JSX element.`);
  console.error('');
}
process.exit(1);
