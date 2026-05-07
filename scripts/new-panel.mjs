#!/usr/bin/env node
/**
 * scripts/new-panel.mjs
 *
 * Scaffold a new panel module:
 *   node scripts/new-panel.mjs <PanelName>
 *
 * Generates:
 *   src/panels/<kebab-name>/<PanelName>.tsx
 *   src/panels/<kebab-name>/<PanelName>.module.css
 *   src/panels/<kebab-name>/index.ts
 *   src/panels/<kebab-name>/CLAUDE.md
 *
 * And wires:
 *   src/app/editors.ts          — import + array entry
 *   src/components/EditorSwitcher.tsx — EditorIcon case
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

function toKebab(pascal) {
  return pascal
    .replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c.toLowerCase() : '-' + c.toLowerCase()))
    .replace(/--+/g, '-');
}

function toCamelAlias(pascal) {
  // e.g. TestPanel → testPanelDef (not testPanelPanelDef)
  const base = pascal.endsWith('Panel') ? pascal.slice(0, -5) : pascal;
  return base.charAt(0).toLowerCase() + base.slice(1) + 'PanelDef';
}

function validatePanelName(name) {
  if (!name) {
    console.error('Usage: node scripts/new-panel.mjs <PanelName>');
    console.error('Example: node scripts/new-panel.mjs MyPanel');
    process.exit(1);
  }
  if (!/^[A-Z][A-Za-z0-9]*Panel$/.test(name)) {
    console.error(`Error: PanelName must be PascalCase and end with "Panel" (e.g. MyPanel).`);
    console.error(`Got: "${name}"`);
    process.exit(1);
  }
}

// ── Template generators ───────────────────────────────────────────────────────

function genTsx(pascalName) {
  const testId = toKebab(pascalName);
  return `import { type Component } from 'solid-js';
import { Panel } from '../../components/Panel';
import { PanelHeader } from '../../components/PanelHeader';
import { PanelContent } from '../../components/PanelContent';
import { PanelEditorSwitcher } from '../../components/PanelEditorSwitcher';
import styles from './${pascalName}.module.css';

const ${pascalName}: Component = () => {
  return (
    <Panel testid="${testId}">
      <PanelHeader title="${pascalName.replace(/Panel$/, '')}" actions={<PanelEditorSwitcher />} />
      <PanelContent>
        <div class={styles.body}>
          {/* TODO: panel content */}
        </div>
      </PanelContent>
    </Panel>
  );
};

export default ${pascalName};
`;
}

function genCss() {
  return `/* Panel root + content layout 由 <Panel> / <PanelContent> 接管 — 這裡只放 panel-specific inner styles */

.body {
  padding: 10px;
  box-sizing: border-box;
  font-size: 11px;
  color: var(--text-secondary);
}
`;
}

function genIndex(pascalName, kebabName, label, category) {
  return `import type { EditorDef } from '../../app/types';
import ${pascalName} from './${pascalName}';

export { default as ${pascalName} } from './${pascalName}';

export const editorDef: EditorDef = {
  id: '${kebabName}',
  label: '${label}',
  category: '${category}',
  component: ${pascalName},
};
`;
}

function genClaudeMd(kebabName) {
  return `# ${kebabName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')} Panel 模組

## 範圍限制
只能修改 src/panels/${kebabName}/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、其他 src/panels/ 子目錄。

## 慣例
- 樣式用 CSS Modules（colocated \`*.module.css\`）+ \`var(--bg-*)\` token
`;
}

// ── Wire: editors.ts ──────────────────────────────────────────────────────────

function wireEditors(editorsPath, pascalName, kebabName) {
  const alias = toCamelAlias(pascalName);
  const importLine = `import { editorDef as ${alias} } from '../panels/${kebabName}';`;
  const arrayEntry = `  ${alias},`;

  let src = readFileSync(editorsPath, 'utf8');

  // Guard: already wired?
  if (src.includes(`'../${kebabName}'`) || src.includes(`"../${kebabName}"`)) {
    console.warn(`[warn] editors.ts already imports from '${kebabName}', skipping editors.ts wiring.`);
    return;
  }

  // Insert import before `export const editors`
  src = src.replace(
    /^(export const editors)/m,
    `${importLine}\n$1`
  );

  // Insert array entry before closing `];`
  src = src.replace(/^(\];)$/m, `${arrayEntry}\n$1`);

  writeFileSync(editorsPath, src, 'utf8');
  console.log(`[wire] editors.ts — added import + array entry for ${pascalName}`);
}

// ── Wire: EditorSwitcher.tsx ──────────────────────────────────────────────────

function wireEditorSwitcher(switcherPath, pascalName, kebabName) {
  const label = pascalName.replace(/Panel$/, '');
  // Simple generic icon: a rounded rect with label letter
  const iconCase = `    case '${kebabName}':
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1.5" y="1.5" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1" fill="none"/>
          <text x="6.5" y="9" text-anchor="middle" font-size="7" fill="currentColor" opacity="0.85">${label.charAt(0).toUpperCase()}</text>
        </svg>
      );`;

  let src = readFileSync(switcherPath, 'utf8');

  // Guard: already wired?
  if (src.includes(`case '${kebabName}':`)) {
    console.warn(`[warn] EditorSwitcher already has case '${kebabName}', skipping icon wiring.`);
    return;
  }

  // Insert before `    default:` in the switch (match the full indented line including newline prefix)
  src = src.replace(
    /(\n    default:)/,
    `\n${iconCase}\n    default:`
  );

  writeFileSync(switcherPath, src, 'utf8');
  console.log(`[wire] EditorSwitcher.tsx — added icon case for '${kebabName}'`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const [, , rawName] = process.argv;
  validatePanelName(rawName);

  const pascalName = rawName;
  const kebabName = toKebab(pascalName);
  const label = pascalName.replace(/Panel$/, '');
  const category = 'App'; // sensible default; edit generated index.ts to change

  const panelDir = resolve(REPO_ROOT, 'src', 'panels', kebabName);

  // Guard: folder already exists
  if (existsSync(panelDir)) {
    console.error(`Error: Panel folder already exists: ${panelDir}`);
    console.error('Remove it first or choose a different name.');
    process.exit(1);
  }

  console.log(`Scaffolding panel: ${pascalName} → src/panels/${kebabName}/`);

  // Create folder + 4 files
  mkdirSync(panelDir, { recursive: true });

  writeFileSync(resolve(panelDir, `${pascalName}.tsx`), genTsx(pascalName), 'utf8');
  console.log(`  + ${pascalName}.tsx`);

  writeFileSync(resolve(panelDir, `${pascalName}.module.css`), genCss(), 'utf8');
  console.log(`  + ${pascalName}.module.css`);

  writeFileSync(resolve(panelDir, 'index.ts'), genIndex(pascalName, kebabName, label, category), 'utf8');
  console.log(`  + index.ts`);

  writeFileSync(resolve(panelDir, 'CLAUDE.md'), genClaudeMd(kebabName), 'utf8');
  console.log(`  + CLAUDE.md`);

  // Wire 3 touchpoints
  const editorsPath = resolve(REPO_ROOT, 'src', 'app', 'editors.ts');
  const switcherPath = resolve(REPO_ROOT, 'src', 'components', 'EditorSwitcher.tsx');

  wireEditors(editorsPath, pascalName, kebabName);
  wireEditorSwitcher(switcherPath, pascalName, kebabName);

  console.log(`\nDone. Next steps:`);
  console.log(`  1. Edit src/panels/${kebabName}/index.ts — set correct category ('Scene'|'Object'|'App')`);
  console.log(`  2. Replace the generic SVG icon in EditorSwitcher.tsx case '${kebabName}'`);
  console.log(`  3. Implement panel content in ${pascalName}.tsx`);
}

main();
