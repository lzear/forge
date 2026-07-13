# @lzear/repo-lint

[![npm](https://img.shields.io/npm/v/@lzear/repo-lint)](https://www.npmjs.com/package/@lzear/repo-lint)
[![license](https://img.shields.io/npm/l/@lzear/repo-lint)](../../LICENSE)

Checks lzear repos against forge standards and keeps them fresh. Used internally by `forge check` and `forge update`.

## Install

```sh
npm install -D @lzear/repo-lint
# or
yarn add -D @lzear/repo-lint
```

Requires Node ≥ 20.

## CLI

```sh
npx repo-lint          # check current directory
```

Most users should use `forge check` via [`@lzear/forge`](https://www.npmjs.com/package/@lzear/forge) instead.

## Programmatic API

```ts
import { checkLocal, checkRepo, CHECKS } from '@lzear/repo-lint'

// Check the current working directory
const report = await checkLocal()
console.log(report.results)
// [
//   { pass: true,  desc: 'README.md exists' },
//   { pass: false, desc: 'publint (all published packages)', detail: '...' },
//   ...
// ]

// Check a remote GitHub repo (clones via gh CLI)
const remote = await checkRepo('lzear/votes', { skipRemote: false })
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
| `ci-workflow`         | a workflow calls the forge reusable CI workflow           |
| `renovate`            | `renovate.json` exists                                    |
| `pkg-publint`         | All published packages pass `publint`                     |
| `pkg-attw`            | All published packages pass `attw` (ESM-only profile)     |
| `pkg-knip`            | No unused exports or dependencies (`knip`)                |
| `monorepo-lint`       | Workspace consistency (`sherif`, monorepos only)          |
| `deps-audit`          | No known vulnerabilities (PM-native `audit`, prod, high+) |
| `deps-deprecated`     | No direct dependency resolves to a deprecated version     |
| `deps-fresh`          | All dependencies up to date (`ncu`)                       |
| `secret-codacy-token` | GitHub secret `CODACY_PROJECT_TOKEN` is set               |

## Part of forge

This package is part of [forge](https://github.com/lzear/forge) — shared dev tooling for lzear repos.
