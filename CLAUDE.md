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

Oxlint evaluated 2026-09 (oxlint 1.86, `@oxlint/migrate`): ~4× faster (2.9s vs 12.4s) but 210 rules unported (181 unicorn v76), per-override settings unsupported (breaks `lzear/prefer-relative-imports` resolver), local plugin needs bundling. Staying on ESLint; revisit when unicorn coverage catches up.

### `@lzear/repo-lint`

Defines `LOCAL_CHECKS` (15) and `REMOTE_CHECKS` (1). Local checks verify: required files (README, .codacy.yml, LICENSE, renovate.json), CI calling the forge reusable workflow (`lzear/forge/.github/workflows/ci.yml`), README badges (Codacy grade/coverage, npm), `deno.json` name/version matching `package.json` (`jsr-config`), and package quality (`publint`, `attw`, `size-limit` where configured, `fallow`, `sherif` for monorepos, audit, no deprecated deps, fresh deps). Remote check verifies the CODACY_PROJECT_TOKEN GitHub secret. Also home of `runUpdate()`/`detectPackageManager()` (`src/update.ts`) powering `forge update`.

`eachPublishedPkg(dir)` walks workspaces, skipping private packages.

### `forge` CLI

`packages/forge/src/bin.ts` — four subcommands via commander:
- `check` — runs `checkLocal()` from `@lzear/repo-lint` on the current repo
- `update` — runs `runUpdate()` from `@lzear/repo-lint`: bumps dependency ranges (ncu), the `packageManager` field, `.nvmrc`/`.node-version`/`.bun-version`, then installs with the detected package manager (npm/yarn/pnpm/bun); `--dry`, `--no-install`
- `setup` — interactive prompt to set GitHub secrets (uses `@clack/prompts`)
- `sync` — fetches `.editorconfig`, `.codacy.yml`, `lefthook.yml`, `.github/zizmor.yml` from forge `main` branch; `--dry` to preview

### CI reuse

`.github/workflows/ci.yml` is a reusable workflow (`workflow_call`), yarn or Bun (by `bun.lock`), consumers call as `lzear/forge/.github/workflows/ci.yml@<sha>` (SHA-pinned, renovate bumps). `actions/setup/action.yml` is a composite action (`lzear/forge/actions/setup@<sha>`) for custom consumer jobs: corepack + setup-node (pm cache) + install. `.github/workflows/release.yml` is the reusable changesets release (forge's own `main.yml` calls it locally): Version Packages PR, then `lzear-publish --publish --release`, optional `deno publish` and snapshot branch. It inlines its setup steps, since a reusable workflow cannot `uses: ./actions/setup` from the caller's checkout.

### Versioning & Publishing

Changesets workflow. Add changeset → merge to `main` → CI opens "Version Packages" PR → merge PR → CI stages on npm (approve with `npm stage approve` + 2FA), publishes to JSR and creates the `v<version>` GitHub release. `lzear-changelog` writes the root `CHANGELOG.md` section before `changeset version`.

JSR: `deno.json` (root) is a Deno workspace; a package opts in by having its own `deno.json`, generated from `package.json` + tsup entries by `lzear-sync-jsr` (`@lzear/configs/src/sync-jsr.mjs`) — never edit one by hand, run `yarn lzear-sync-jsr` (`yarn qa` runs it with `--check`). `@lzear/eslint-config` stays npm-only: the untyped ESLint plugins it wraps rely on ambient `declare module` shims JSR cannot resolve, which is also why `@lzear/forge` drops its `./eslint` export there.

```bash
yarn changeset        # create changeset on your branch
yarn version-packages # version bump (CI runs this)
yarn lzear-publish    # dry run; CI passes --publish --release
```
