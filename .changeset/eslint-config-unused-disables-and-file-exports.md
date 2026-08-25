---
'@lzear/eslint-config': patch
---

Enable `reportUnusedDisableDirectives` and `reportUnusedInlineConfigs`, add `@typescript-eslint/consistent-type-imports` (inline style) and `import-x/consistent-type-specifier-style` (prefer-inline), export shared file-glob constants (`FILES.TESTS`, `FILES.REACT`, `FILES.TS`, `FILES.JS`, `FILES.CORE`, `FILES.PACKAGE_JSON`, and their atoms), and export the individual config builders (`core`, `react`, `node`, `typescript`, `vitest`, `a11y`, `packageJson`, `prettier`, `ignores`) so consumers can inspect, reuse, or replace a single layer instead of only appending overrides on top, and turn off `@typescript-eslint/no-non-null-assertion`, the `@typescript-eslint/no-unsafe-*` rules, and `sonarjs/no-duplicate-string` in test files, where they mostly fight mocks and fixtures.
