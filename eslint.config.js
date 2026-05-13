// ESLint flat config — Erythos module boundary contract enforcement
//
// Design intent: this config ONLY mechanises the "module boundary" clauses from
// CLAUDE.md ("core/ 不依賴 UI; panels/ 只透過 bridge 取狀態").
// It is NOT a style-enforcement config. All rules other than no-restricted-imports
// are intentionally left off so that pre-existing code is not disturbed.
//
// All imports in this repo use relative paths (no @/ alias in runtime code),
// so the patterns match the literal "../../core/..." strings seen in source.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  // ── Rule 0: FileSystemDirectoryHandle must only appear in LocalProject* files ─
  // Corresponds to: G1 refactor — FS handle surface confined to LocalProjectManager.ts
  // and ProjectHandleStore.ts. Test files and the interface declaration (ProjectManager.ts
  // itself, which defines ProjectIdentifier with the handle field) are allowed.
  //
  // Allow-list (glob patterns NOT in this rule's `files`):
  //   src/core/project/LocalProjectManager.ts  — the impl class
  //   src/core/project/ProjectManager.ts       — defines ProjectIdentifier.handle field
  //   src/core/project/ProjectHandleStore.ts   — IDB store; holds handles by design
  //   src/**/__tests__/**                      — test mocks cast to FSDH freely
  {
    files: [
      'src/**/*.{ts,tsx}',
    ],
    ignores: [
      'src/core/project/LocalProjectManager.ts',
      'src/core/project/ProjectManager.ts',
      'src/core/project/ProjectHandleStore.ts',
      'src/**/__tests__/**',
    ],
    languageOptions: { parser: tsParser },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Match any TypeScript type reference to FileSystemDirectoryHandle
          selector: 'TSTypeReference[typeName.name="FileSystemDirectoryHandle"]',
          message:
            '[G1] FileSystemDirectoryHandle must only appear in LocalProject* files and ProjectHandleStore — use LocalProjectManager instead (docs/cloud-project-spec.md § G1)',
        },
        {
          // Also catch identifier references (e.g. global usage without type annotation)
          selector: 'Identifier[name="FileSystemDirectoryHandle"]:not([parent.type="TSTypeReference"])',
          message:
            '[G1] FileSystemDirectoryHandle must only appear in LocalProject* files and ProjectHandleStore — use LocalProjectManager instead (docs/cloud-project-spec.md § G1)',
        },
      ],
    },
  },

  // ── Rule 1: src/core/** must not import UI layers ─────────────────────────
  // Corresponds to: "core/ 不依賴 UI"
  // Forbidden targets from core: components/, panels/, app/, viewport/
  {
    files: ['src/core/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(\\.\\./)*components/',
              message:
                '[module-boundary] src/core must not import from components/ (core must not depend on UI)',
            },
            {
              regex: '(\\.\\./)*panels/',
              message:
                '[module-boundary] src/core must not import from panels/ (core must not depend on UI)',
            },
            {
              regex: '(\\.\\./)*app/',
              message:
                '[module-boundary] src/core must not import from app/ (core must not depend on UI)',
            },
            {
              regex: '(\\.\\./)*viewport/',
              message:
                '[module-boundary] src/core must not import from viewport/ (core must not depend on UI)',
            },
          ],
        },
      ],
    },
  },

  // ── Rule 2: src/panels/** must not import src/core/** at runtime ──────────
  // Corresponds to: "panels/ 只透過 bridge 取狀態" (取狀態 = read, type-only).
  // panels/ may import src/app/bridge.ts (lives in app/, not core/), which is fine.
  // `import type` is permitted (erased at compile time → no runtime dependency).
  // Runtime imports (Command classes, Editor, helpers) must go through bridge.
  // Bridge migration tracked separately — see initiatives.md § B.
  {
    files: ['src/panels/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(\\.\\./)*core/',
              message:
                '[module-boundary] src/panels must not import from core/ at runtime — use src/app/bridge.ts (type imports are permitted)',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
];
