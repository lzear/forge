# forge

[![CI](https://github.com/lzear/forge/actions/workflows/main.yml/badge.svg)](https://github.com/lzear/forge/actions/workflows/main.yml)
[![last commit](https://img.shields.io/github/last-commit/lzear/forge)](https://github.com/lzear/forge/commits/main)
[![Codacy grade](https://app.codacy.com/project/badge/Grade/e9dcbdfc5611478d81981841c10d42fa)](https://app.codacy.com/gh/lzear/forge)
[![Codacy coverage](https://app.codacy.com/project/badge/Coverage/e9dcbdfc5611478d81981841c10d42fa)](https://app.codacy.com/gh/lzear/forge)
[![license](https://img.shields.io/github/license/lzear/forge)](LICENSE)
[![language](https://img.shields.io/github/languages/top/lzear/forge)](https://github.com/lzear/forge)

> Shared dev tooling, configs, and standards for all lzear repos.

## Packages

- [![npm](https://img.shields.io/npm/v/@lzear/forge)](https://www.npmjs.com/package/@lzear/forge) ![downloads](https://img.shields.io/npm/dm/@lzear/forge) [![Libraries.io](https://img.shields.io/librariesio/release/npm/@lzear/forge)](https://libraries.io/npm/@lzear%2Fforge) **[`@lzear/forge`](packages/forge)** — Umbrella: one dep for everything + `forge` CLI

- [![npm](https://img.shields.io/npm/v/@lzear/configs)](https://www.npmjs.com/package/@lzear/configs) ![downloads](https://img.shields.io/npm/dm/@lzear/configs) [![Libraries.io](https://img.shields.io/librariesio/release/npm/@lzear/configs)](https://libraries.io/npm/@lzear%2Fconfigs) **[`@lzear/configs`](packages/configs)** — tsconfig, vitest, tsup, vite configs

- [![npm](https://img.shields.io/npm/v/@lzear/eslint-config)](https://www.npmjs.com/package/@lzear/eslint-config) ![downloads](https://img.shields.io/npm/dm/@lzear/eslint-config) [![Libraries.io](https://img.shields.io/librariesio/release/npm/@lzear/eslint-config)](https://libraries.io/npm/@lzear%2Feslint-config) **[`@lzear/eslint-config`](packages/eslint-config)** — ESLint flat config
  
- [![npm](https://img.shields.io/npm/v/@lzear/repo-lint)](https://www.npmjs.com/package/@lzear/repo-lint) ![downloads](https://img.shields.io/npm/dm/@lzear/repo-lint) [![Libraries.io](https://img.shields.io/librariesio/release/npm/@lzear/repo-lint)](https://libraries.io/npm/@lzear%2Frepo-lint) **[`@lzear/repo-lint`](packages/repo-lint)** — Repo compliance checker
  

## Usage

```sh
yarn add -D @lzear/forge
```

```sh
yarn forge check          # audit this repo against forge standards
yarn forge setup          # check and set required GitHub secrets
yarn forge sync           # pull shared files from forge into this repo
```

### `forge sync`

Writes the following files (fetched from `main`):

| File            | Purpose                           |
|-----------------|-----------------------------------|
| `.editorconfig` | Editor whitespace/indent settings |
| `.codacy.yml`   | Codacy analysis config            |

Run with `--dry` to preview without writing.

## CI

| Event | Jobs |
|---|---|
| Push to any branch | `ci` — install, lint, test, build, `forge check` |
| Push to `main` | `ci` then `release` — changesets opens/updates a **"Version Packages"** PR |
| Merge "Version Packages" PR | `release` publishes changed packages to npm |

The CI and release workflows are reusable (`workflow_call`) and can be consumed by other lzear repos.

## Development

```sh
yarn install
yarn build
yarn test
yarn qa        # build + typecheck + lint + test (parallel) + forge check
```

## Publishing

Publishing is fully automated via CI:

1. Add a changeset on your branch:
   ```sh
   yarn changeset
   ```
2. Merge to `main`
3. CI opens (or updates) a **"Version Packages"** PR
4. Merge that PR → CI publishes to npm automatically
