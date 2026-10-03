<p align="center">
  <picture>
    <img alt="forge" src="assets/forge.svg" width="300"/>
  </picture>
</p>

# forge

[![npm](https://img.shields.io/npm/v/@lzear/forge)](https://www.npmjs.com/package/@lzear/forge)
[![jsr](https://jsr.io/badges/@lzear/forge)](https://jsr.io/@lzear/forge)
[![last commit](https://img.shields.io/github/last-commit/lzear/forge)](https://github.com/lzear/forge/commits/main)
[![Codacy grade](https://app.codacy.com/project/badge/Grade/e9dcbdfc5611478d81981841c10d42fa)](https://app.codacy.com/gh/lzear/forge)
[![Codacy coverage](https://app.codacy.com/project/badge/Coverage/e9dcbdfc5611478d81981841c10d42fa)](https://app.codacy.com/gh/lzear/forge)
[![license](https://img.shields.io/github/license/lzear/forge)](LICENSE)
[![language](https://img.shields.io/github/languages/top/lzear/forge)](https://github.com/lzear/forge)

> Shared dev tooling, configs, and standards for all lzear repos.

## Packages

- **[`@lzear/forge`](packages/forge)** — Umbrella: one dep for everything + `forge` CLI

- **[`@lzear/configs`](packages/configs)** — tsconfig, vitest, tsup, vite, commitlint configs

- **[`@lzear/eslint-config`](packages/eslint-config)** — ESLint flat config
  
- **[`@lzear/repo-lint`](packages/repo-lint)** — Repo compliance checker
  

All but `@lzear/eslint-config` also publish to [JSR](https://jsr.io/@lzear); it
stays npm-only because several ESLint plugins it wraps ship no types, and JSR
cannot resolve the ambient `declare module` shims in `environment.d.ts`. A
package opts into JSR by having a `deno.json`; its contents are generated from
`package.json` and the tsup entries by `yarn lzear-sync-jsr`, never edited by
hand.

Complements [e18e](https://e18e.dev): the ESLint config runs `e18e/ban-dependencies`, CI runs `e18e analyze`.

## Usage

```sh
yarn add -D @lzear/forge
```

```sh
yarn forge check          # audit this repo against forge standards
yarn forge setup          # check and set required GitHub secrets
yarn forge sync           # pull shared files from forge into this repo
```

### `@lzear/eslint-config`

```sh
yarn add -D @lzear/eslint-config eslint
```

**Minimal `eslint.config.ts`:**

```ts
import lzearConfig from '@lzear/eslint-config'

export default await lzearConfig()
```

**With options** — disable feature sets you don't use:

```ts
import lzearConfig from '@lzear/eslint-config'

export default await lzearConfig({
  react: false,    // not a React project
  vitest: false,   // no tests
})
```

Available options (all default to `true`): `node`, `react`, `typescript`, `vitest`.

**Extend with extra rules, overrides, and ignores:**

```ts
import type { Linter } from 'eslint'
import lzearConfig from '@lzear/eslint-config'

const base = await lzearConfig({ react: false })

const config: Linter.Config[] = [
  ...base,

  // Extra rules applied to all files
  {
    rules: {
      'no-console': 'error',
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    },
  },

  // Turn off or downgrade specific rules
  {
    rules: {
      'sonarjs/cognitive-complexity': 'off',
      'import-x/order': 'warn',
    },
  },

  // Override rules for specific files
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'unicorn/no-process-exit': 'off',
    },
  },

  // Ignore generated files and specific folders
  {
    ignores: [
      'src/generated/**',
      'public/**',
      '**/*.min.js',
    ],
  },
]

export default config
```

### `@lzear/configs` — commitlint

```sh
yarn add -D @lzear/forge @commitlint/cli lefthook
```

**`commitlint.config.ts`:**

```ts
import config from '@lzear/forge/commitlint'
export default config
```

**`lefthook.yml`** (or run `forge sync` to get it):

```yaml
commit-msg:
  commands:
    commitlint:
      run: yarn commitlint --edit {1}
```

Add `"prepare": "lefthook install"` to `package.json` to auto-install hooks on `yarn install`.

Enforces [Conventional Commits](https://www.conventionalcommits.org/) with `header-max-length` of 100.

**Require every commit to start with an emoji:**

```ts
import emoji from '@lzear/forge/commitlint/emoji'
export default emoji
```

Combine both:

```ts
import base from '@lzear/forge/commitlint'
import emoji from '@lzear/forge/commitlint/emoji'

export default {
  ...base,
  plugins: [...(base.plugins ?? []), ...(emoji.plugins ?? [])],
  rules: { ...base.rules, ...emoji.rules },
}
```

### `forge sync`

Writes the following files (fetched from `main`):

| File                 | Purpose                                        |
|----------------------|------------------------------------------------|
| `.codacy.yml`        | Codacy analysis config                         |
| `lefthook.yml`       | Git hooks (commitlint on commit-msg)           |
| `.github/zizmor.yml` | zizmor policy (hash-pin all action refs)       |

Run with `--dry` to preview without writing.

## CI

| Event                       | Jobs                                                                       |
|-----------------------------|----------------------------------------------------------------------------|
| Push to any branch          | `ci` — install, lint, test, build, `forge check`                           |
| Push to `main`              | `ci` then `release` — changesets opens/updates a **"Version Packages"** PR |
| Merge "Version Packages" PR | `release` stages changed packages on npm and creates the GitHub release   |

### Consuming CI from other repos

Default: call the reusable workflow — zizmor and future jobs come along automatically. Pin to a commit SHA (renovate's `github-actions` manager keeps it fresh):

```yaml
jobs:
  ci:
    uses: lzear/forge/.github/workflows/ci.yml@<sha> # v4.3.0
    secrets:
      CODACY_PROJECT_TOKEN: ${{ secrets.CODACY_PROJECT_TOKEN }}
```

Inputs: `node-version`, `coverage-command`, `run-check`. Extra repo-specific jobs live alongside the `ci:` job in the caller.

A `bun.lock` switches it to Bun: `bun install --frozen-lockfile`, `bun run <script>` and `bun test --coverage --coverage-reporter=lcov`. Node is still set up for forge, fallow and e18e; fallow scores complexity without coverage, since Bun writes no `coverage-final.json`.

Releases: the reusable release workflow runs changesets, stages on npm with `lzear-publish` (add `@lzear/configs` as a dev dependency) and creates the GitHub release. npm matches the caller's workflow file, so set the package's trusted publisher to `<owner>/<repo>` / `main.yml`, stage only:

```yaml
  release:
    if: github.event_name == 'push'
    needs: ci
    uses: lzear/forge/.github/workflows/release.yml@<sha> # v4.5.0
    permissions:
      contents: write
      pull-requests: write
      id-token: write
```

Inputs: `node-version`, `version-script` (default `yarn changeset version`), `jsr` (also `deno publish`), `snapshot-branch` (stage a `x.y.z-snapshot-<timestamp>` version under the `snapshot` dist-tag on every push to that branch).

Custom pipelines: skip the workflow and compose steps with the setup action (node + corepack + package-manager cache + immutable install):

```yaml
steps:
  - uses: actions/checkout@<sha> # v4.3.1
  - uses: lzear/forge/actions/setup@<sha> # v4.3.0
  - run: yarn do-your-thing
```

Inputs: `node-version` (default `26`), `cache` (default `yarn`), `install-command` (default `yarn install --immutable`).

## Development

```sh
yarn install
yarn build
yarn test
yarn qa        # build + typecheck + lint + test (parallel) + forge check
```

## Publishing

```sh
yarn changeset   # create a changeset on your branch
```

Merge to `main` → CI opens a **"Version Packages"** PR. Merge that PR → CI stages the packages on npm, publishes to JSR and creates the GitHub release. Approve the staged versions with `npm stage approve` (2FA) to make them live.

Prereleases use changesets pre mode on `main`; `lzear-publish` stages each one under its id (`beta`, `rc`) and marks its GitHub release as a prerelease:

```sh
yarn changeset pre enter beta                          # next Version Packages PR → x.y.z-beta.0, then beta.1 …
yarn changeset pre exit && yarn changeset pre enter rc # → x.y.z-rc.0
yarn changeset pre exit                                # → x.y.z on `latest`, changelog covers the whole cycle
```

While in pre mode every release from `main` is a prerelease.
