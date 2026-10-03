# @lzear/repo-lint

[![npm](https://img.shields.io/npm/v/@lzear/repo-lint)](https://www.npmjs.com/package/@lzear/repo-lint)
[![jsr](https://jsr.io/badges/@lzear/repo-lint)](https://jsr.io/@lzear/repo-lint)
[![license](https://img.shields.io/npm/l/@lzear/repo-lint)](../../LICENSE)

Checks lzear repos against forge standards and keeps them fresh. Used internally by `forge check` and `forge update`.

## Install

```sh
npm install -D @lzear/repo-lint
# or
yarn add -D @lzear/repo-lint
```

Requires Node ≥ 20.

## Programmatic API

```ts
import { checkLocal, CHECKS } from '@lzear/repo-lint'

// Check the current working directory
const report = await checkLocal()
console.log(report.results)
// [
//   { pass: true,  desc: 'README.md exists' },
//   { pass: false, desc: 'publint (all published packages)', detail: '...' },
//   ...
// ]
```

### `checkLocal(options?)`

| Option        | Type      | Default | Description                       |
|---------------|-----------|---------|-----------------------------------|
| `skipRemote`  | `boolean` | `false` | Skip GitHub secret checks         |

Returns `Promise<RepoReport>`.

### `RepoReport`

```ts
interface RepoReport {
  repo: string
  results: { pass: boolean; desc: string; detail?: string }[]
}
```

### `runUpdate(options?)`

Powers `forge update`. Detects the package manager (npm, yarn, pnpm, bun) and updates dependency ranges (ncu, honoring `.ncurc{,.json,.js,.cjs,.mjs}`), the `packageManager` field, `.nvmrc`/`.node-version` (latest Node LTS), and `.bun-version`, then installs & refreshes the lockfile.

```ts
import { detectPackageManager, runUpdate } from '@lzear/repo-lint'

const report = await runUpdate({ dry: true })
// { dir, packageManager: { name: 'yarn', version: '4.17.1', … }, results: [...] }
```

| Option    | Type      | Default         | Description                        |
|-----------|-----------|-----------------|------------------------------------|
| `dir`     | `string`  | `process.cwd()` | Repo to update                     |
| `dry`     | `boolean` | `false`         | Report changes without writing     |
| `install` | `boolean` | `true`          | Run install/lockfile refresh after |

## Checks performed

| Check                 | Description                                               |
|-----------------------|-----------------------------------------------------------|
| `readme-exists`       | `README.md` exists                                        |
| `readme-npm-badge`    | README has an npm badge                                   |
| `codacy`              | Codacy grade & coverage badges in README, `.codacy.yml`   |
| `license`             | `LICENSE` exists                                          |
| `jsr-config`          | `deno.json` name & version match `package.json`           |
| `ci-workflow`         | a workflow calls the forge reusable CI workflow           |
| `renovate`            | `renovate.json` exists                                    |
| `pkg-publint`         | All published packages pass `publint`                     |
| `pkg-attw`            | All published packages pass `attw` (ESM-only profile)     |
| `pkg-size-limit`      | Within `size-limit` budgets (where configured)            |
| `pkg-fallow`          | No unused files, exports or dependencies (`fallow`)       |
| `monorepo-lint`       | Workspace consistency (`sherif`, monorepos only)          |
| `deps-audit`          | No known vulnerabilities (PM-native `audit`, prod, high+) |
| `deps-deprecated`     | No direct dependency resolves to a deprecated version     |
| `deps-fresh`          | All dependencies up to date (`ncu`, honours `.ncurc`)     |
| `secret-codacy-token` | GitHub secret `CODACY_PROJECT_TOKEN` is set               |

## Part of forge

This package is part of [forge](https://github.com/lzear/forge) — shared dev tooling for lzear repos.
