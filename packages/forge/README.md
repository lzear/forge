# @lzear/forge

[![npm](https://img.shields.io/npm/v/@lzear/forge)](https://www.npmjs.com/package/@lzear/forge)
[![license](https://img.shields.io/npm/l/@lzear/forge)](../../LICENSE)

Umbrella package for lzear dev tooling. One dependency gives you ESLint config, shared build configs, commitlint config, repo compliance checks, and the `forge` CLI.

## Install

```sh
npm install -D @lzear/forge
# or
yarn add -D @lzear/forge
```

Requires Node ≥ 20.

## CLI

```sh
yarn forge check          # audit this repo against forge standards
yarn forge setup          # check and set required GitHub secrets
yarn forge sync           # pull shared files from forge into this repo
```

### `forge check`

Audits the current repo (or a list of remote repos) against forge standards: README, badges, license, CI workflow, package hygiene (`publint`, `attw`, `knip`), and up-to-date dependencies.

```sh
forge check                         # current repo
forge check --repos lzear/votes     # remote repo (clones via gh)
forge check --repos lzear/a,lzear/b # multiple repos
forge check --json                  # machine-readable output
forge check --skip-remote           # skip GitHub secret checks
```

### `forge setup`

Checks and sets the required GitHub secrets (`NPM_TOKEN`, `CODACY_PROJECT_TOKEN`) for a repo.

```sh
forge setup                         # auto-detects repo from git remote
forge setup --repo lzear/my-repo
forge setup --dry                   # check only, do not prompt
```

### `forge sync`

Fetches shared template files from the forge `main` branch and writes them locally.

```sh
forge sync        # write .editorconfig, .codacy.yml, lefthook.yml
forge sync --dry  # preview without writing
```

## ESLint config

```ts
// eslint.config.ts
import lzearConfig from '@lzear/forge/eslint'

export default await lzearConfig()
```

See [`@lzear/eslint-config`](https://www.npmjs.com/package/@lzear/eslint-config) for full options and extension examples.

## tsconfig

```json
{
  "extends": "@lzear/forge/tsconfig/lib"
}
```

Presets: `lib`, `app`, `react`.

## tsup

```ts
// tsup.config.ts
import { defineLibConfig } from '@lzear/forge/tsup'

export default defineLibConfig({ index: 'src/index.ts' })
```

## vitest

```ts
// vitest.config.ts
import config from '@lzear/forge/vitest'

export default config
```

For React: `@lzear/forge/vitest/react`.

## vite

```ts
// vite.config.ts
import config from '@lzear/forge/vite'

export default config
```

## commitlint

```ts
// commitlint.config.ts
import config from '@lzear/forge/commitlint'

export default config
```

Enforces [Conventional Commits](https://www.conventionalcommits.org/) with `header-max-length` of 100. Pair with `lefthook.yml` (via `forge sync`) to run on every commit.

Require every commit to start with an emoji:

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

## Repo compliance

Programmatic access to the checks run by `forge check`:

```ts
import { checkLocal, checkRepo } from '@lzear/forge/repo-lint'

const report = await checkLocal()
console.log(report.results)
```

## Source

[github.com/lzear/forge](https://github.com/lzear/forge)
