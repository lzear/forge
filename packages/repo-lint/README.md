# @lzear/repo-lint

[![npm](https://img.shields.io/npm/v/@lzear/repo-lint)](https://www.npmjs.com/package/@lzear/repo-lint)
[![license](https://img.shields.io/npm/l/@lzear/repo-lint)](../../LICENSE)

Checks lzear repos against forge standards. Used internally by `forge check`.

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

## Checks performed

| Check                          | Description                                           |
|--------------------------------|-------------------------------------------------------|
| `readme-exists`                | `README.md` exists                                    |
| `readme-npm-badge`             | README has an npm badge                               |
| `readme-codacy-grade-badge`    | README has Codacy grade badge                         |
| `readme-codacy-coverage-badge` | README has Codacy coverage badge                      |
| `codacy-config`                | `.codacy.yml` exists                                  |
| `license`                      | `LICENSE` exists                                      |
| `ci-workflow`                  | `.github/workflows/ci.yml` exists                     |
| `renovate`                     | `renovate.json` exists                                |
| `pkg-publint`                  | All published packages pass `publint`                 |
| `pkg-attw`                     | All published packages pass `attw` (ESM-only profile) |
| `pkg-knip`                     | No unused exports or dependencies (`knip`)            |
| `deps-fresh`                   | All dependencies up to date (`ncu`)                   |
| `secret-npm-token`             | GitHub secret `NPM_TOKEN` is set                      |
| `secret-codacy-token`          | GitHub secret `CODACY_PROJECT_TOKEN` is set           |

## Part of forge

This package is part of [forge](https://github.com/lzear/forge) — shared dev tooling for lzear repos.
