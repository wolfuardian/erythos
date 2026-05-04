/**
 * inline-style.mjs — Audit all style={ occurrences in src/**\/*.tsx
 *
 * For each occurrence:
 *   - If the line or 1-2 lines above contain "// inline-allowed:", it is allowlisted.
 *   - Otherwise it is a violation.
 *
 * EXIT 0 if violations == 0, EXIT 1 otherwise.
 *
 * Usage: node scripts/audit/inline-style.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Glob tsx files under src/ ────────────────────────────────────────────────

function walkDir(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

import { fileURLToPath } from 'node:url';
const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../');
const srcDir = path.join(repoRoot, 'src');

const files = walkDir(srcDir);

// ── Scan each file ───────────────────────────────────────────────────────────

const allowlisted = [];
const violations = [];

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('style={')) continue;

    const lineNumber = i + 1; // 1-based

    // Check same line and up to 5 lines above for inline-allowed comment.
    // The look-back window is wide enough to handle multi-line JSX elements
    // where the comment appears before the opening tag and style= is an
    // attribute on a later line (e.g. 3-4 lines below the comment).
    const lookBack = 5;
    const searchLines = [];
    for (let k = 0; k <= lookBack; k++) {
      if (i - k >= 0) searchLines.push(lines[i - k]);
    }

    // Accept both JS line comments (// inline-allowed:) and JSX block
    // comments ({/* inline-allowed: */}) as valid annotation forms.
    const allowedLine = searchLines.find(
      l => l.includes('// inline-allowed:') || l.includes('/* inline-allowed:')
    );

    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

    if (allowedLine) {
      const marker = allowedLine.includes('// inline-allowed:') ? '// inline-allowed:' : '/* inline-allowed:';
      const rawReason = allowedLine.split(marker)[1] ?? '';
      // Strip trailing */ or */ from block comments
      const reason = rawReason.replace(/\s*\*\/\s*\}?\s*$/, '').trim();
      allowlisted.push({ path: relPath, line: lineNumber, reason });
    } else {
      violations.push({ path: relPath, line: lineNumber, content: line.trim() });
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const total = allowlisted.length + violations.length;

console.log('Inline Style Audit');
console.log('==================');
console.log(`Total style={ sites: ${total}`);
console.log(`Allowlisted:    ${allowlisted.length}`);
console.log(`Violations:     ${violations.length}`);
console.log('');

if (allowlisted.length > 0) {
  console.log('Allowlisted sites:');
  for (const { path: p, line, reason } of allowlisted) {
    console.log(`  ${p}:${line} — ${reason}`);
  }
  console.log('');
}

if (violations.length > 0) {
  console.log('Violations:');
  for (const { path: p, line, content } of violations) {
    console.log(`  ${p}:${line}`);
    console.log(`    ${content}`);
  }
  console.log('');
}

process.exit(violations.length === 0 ? 0 : 1);
