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

export default [
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

  // ── Rule 2: src/panels/** must not import src/core/** directly ────────────
  // Corresponds to: "panels/ 只透過 bridge 取狀態"
  // panels/ may import src/app/bridge.ts (lives in app/, not core/), which is fine.
  // Any direct relative import that traverses into core/ is forbidden.
  {
    files: ['src/panels/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(\\.\\./)*core/',
              message:
                '[module-boundary] src/panels must not import from core/ directly — use src/app/bridge.ts instead',
            },
          ],
        },
      ],
    },
  },
];
