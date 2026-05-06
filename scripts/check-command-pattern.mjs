#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * check-command-pattern.mjs — enforce Architecture Contract #1
 *
 * Contract (CLAUDE.md, 架構契約 #1):
 *   "Command 模式：所有場景變更經 Command + editor.execute()，
 *    以保 undo/redo"
 *
 * Mechanism:
 *   SceneDocument has exactly 4 mutating methods:
 *     addNode / removeNode / updateNode / deserialize
 *
 *   These should only be called from:
 *     (a) src/core/commands/**          — Command implementations
 *     (b) src/core/scene/SceneDocument.ts — self (internal calls)
 *     (c) src/core/Editor.ts            — thin wrappers for loadScene;
 *                                          also exposes addNode/removeNode
 *                                          wrappers that Commands call via editor.*
 *     (d) src/core/scene/SceneSync.ts   — gray-list: prefab live-sync
 *                                          rebuilds are not user-initiated;
 *                                          they fan out from a prefab file change
 *                                          upstream. Whitelisted intentionally.
 *
 *   Calls from src/panels/**, src/components/**, src/app/**,
 *   src/viewport/** are violations.
 *
 * Why grep/regex (not AST):
 *   Consistent with the project's scripts/*.mjs tooling style (new-command.mjs,
 *   worktree.mjs). AST libraries (ts-morph, @babel/parser) are not devDependencies.
 *   The pattern `.(addNode|removeNode|updateNode|deserialize)(` with leading dot
 *   avoids false-positive matches on method declarations.
 *   Test files (under __tests__ dirs, or *.test.ts) are excluded — not part of
 *   the runtime contract.
 *
 * Usage:
 *   node scripts/check-command-pattern.mjs
 *
 * Exit 0 — all PASS
 * Exit 1 — one or more violations found (listed to stdout)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Mutating methods on SceneDocument ────────────────────────────────────────

const MUTATORS = ['addNode', 'removeNode', 'updateNode', 'deserialize'];

// Regex: requires leading dot so method declarations don't self-match.
// e.g.  this.editor.sceneDocument.addNode(  ← match
//        addNode(node: SceneNode): void {    ← no match (no leading dot)
const MUTATOR_RE = new RegExp(
  `\\.(?:${MUTATORS.join('|')})\\s*\\(`,
);

// ── Path classification (forward-slash normalized) ────────────────────────────

/**
 * Normalize an absolute path to forward-slash form for reliable prefix matching.
 */
function normalize(p) {
  return p.replaceAll('\\', '/');
}

const ROOT_FWD = normalize(REPO_ROOT);

/**
 * Return the repo-relative path (forward-slash) for an absolute file path.
 */
function relFwd(absPath) {
  return normalize(absPath).slice(ROOT_FWD.length + 1);
}

/**
 * White-list: allowed to call SceneDocument mutators.
 * Paths are repo-relative, forward-slash.
 */
function isAllowed(rel) {
  return (
    rel.startsWith('src/core/commands/') ||
    rel === 'src/core/scene/SceneDocument.ts' ||
    rel === 'src/core/Editor.ts' ||
    rel === 'src/core/scene/SceneSync.ts'   // gray-list → allow (see header)
  );
}

/**
 * Test file: skip entirely — not part of runtime contract.
 */
function isTestFile(rel) {
  return rel.includes('/__tests__/') || rel.endsWith('.test.ts');
}

// ── File walker ───────────────────────────────────────────────────────────────

/**
 * Recursively collect all *.ts files under `dir`.
 */
function collectTS(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTS(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const srcDir = path.join(REPO_ROOT, 'src');
const allFiles = collectTS(srcDir);

const violations = [];

for (const file of allFiles) {
  const rel = relFwd(file);

  // Skip test files — not part of runtime contract
  if (isTestFile(rel)) continue;

  // Skip allow-listed paths
  if (isAllowed(rel)) continue;

  // Only scan the "blacklist" zones: panels / components / app / viewport
  // (and anything else outside core/ that we didn't whitelist)
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (MUTATOR_RE.test(lines[i])) {
      // Extract which method matched for the report
      const match = lines[i].match(
        /\.(?<method>addNode|removeNode|updateNode|deserialize)\s*\(/,
      );
      const method = match?.groups?.method ?? '?';
      violations.push({
        file: rel,
        line: i + 1,
        method,
        text: lines[i].trimEnd(),
      });
    }
  }
}

if (violations.length === 0) {
  console.log('All scene mutations go through Commands ✓');
  process.exit(0);
}

console.error(`Command pattern violations found: ${violations.length}\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  .${v.method}()`);
  console.error(`    ${v.text.trim()}`);
  console.error('');
}
process.exit(1);
