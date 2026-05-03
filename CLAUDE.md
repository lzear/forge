# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Yarn workspaces monorepo of shared dev tooling published to npm. Four packages under `packages/`:

| Package                | Description                                                 |
|------------------------|-------------------------------------------------------------|
| `@lzear/forge`         | Umbrella re-export package + `forge` CLI (check/setup/sync) |
| `@lzear/configs`       | Shared tsconfig, tsup, vite, vitest config factories        |
| `@lzear/eslint-config` | ESLint flat config (async factory, feature flags)           |
| `@lzear/repo-lint`     | Repo compliance checker (local + remote checks)             |

## Commands

```bash
yarn install
yarn build           # topological workspace build via tsup
yarn test            # all workspaces
yarn typecheck       # all workspaces
yarn lint            # eslint .
yarn qa              # build + typecheck + lint + test + forge check
```

Single test file:
```bash
cd packages/<name>
yarn vitest run src/checks.test.ts
```

## Architecture

### Build

All packages build with `tsup`. Config factories in `@lzear/configs/src/tsup.ts`:
- `defineLibConfig()` — ESM lib with dts
- `defineBinConfig()` — ESM binary with shebang, `clean: false`

`@lzear/forge` re-exports the other three packages as named subpath exports (`./eslint`, `./repo-lint`, `./tsup`, `./vite`, `./vitest`, `./vitest/react`, `./tsconfig/*`).

### `@lzear/eslint-config`

Async default export `configGenerator(options)`. Options: `node | react | typescript | vitest` (all default `true`). Each feature section loaded in parallel via `Promise.all`. Prettier config is last to override others.

### `@lzear/repo-lint`

Defines `LOCAL_CHECKS` (13) and `REMOTE_CHECKS` (2). Local checks verify: required files (README, .editorconfig, .codacy.yml, LICENSE, CI workflow, renovate.json), README badges (Codacy grade/coverage, npm), and package quality (`publint`, `attw`, `knip`, fresh deps). Remote checks verify GitHub secrets (NPM_TOKEN, CODACY_PROJECT_TOKEN).

`eachPublishedPkg(dir)` walks workspaces, skipping private packages.

### `forge` CLI

`packages/forge/src/bin.ts` — three subcommands via commander:
- `check` — runs `checkLocal()` + `checkRepo()` from `@lzear/repo-lint`
- `setup` — interactive prompt to set GitHub secrets (uses `@clack/prompts`)
- `sync` — fetches `.editorconfig` and `.codacy.yml` from forge `main` branch; `--dry` to preview

### Versioning & Publishing

Changesets workflow. Add changeset → merge to `main` → CI opens "Version Packages" PR → merge PR → CI publishes to npm.

```bash
yarn changeset        # create changeset on your branch
yarn version-packages # version bump (CI runs this)
yarn release          # publish (CI runs this)
```
