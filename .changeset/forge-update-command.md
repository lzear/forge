---
'@lzear/repo-lint': minor
'@lzear/forge': minor
---

New `forge update` command: one-stop repo freshening. Detects the package manager (npm, yarn, pnpm, bun) and updates dependency ranges (ncu), the `packageManager` field (yarn ≥ 2 resolved from `@yarnpkg/cli-dist`), `.nvmrc`/`.node-version` (latest Node LTS) and `.bun-version`, then installs & refreshes the lockfile with the detected package manager. Honors `.ncurc{,.json,.js,.cjs,.mjs}` (e.g. `reject`) even where ncu's programmatic API would ignore it. Supports `--dry`, `--no-install`, `--json`. Programmatic API: `runUpdate()` and `detectPackageManager()` in `@lzear/repo-lint`.
