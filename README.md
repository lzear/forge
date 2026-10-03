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

- **[`@lzear/forge`](packages/forge)** — umbrella: one dep for everything + `forge` CLI
- **[`@lzear/configs`](packages/configs)** — tsconfig, vitest, tsup, vite, commitlint configs
- **[`@lzear/eslint-config`](packages/eslint-config)** — ESLint flat config (npm only)
- **[`@lzear/repo-lint`](packages/repo-lint)** — repo compliance checker

Start with `yarn add -D @lzear/forge && yarn forge check`. Complements [e18e](https://e18e.dev): the ESLint config runs `e18e/ban-dependencies`, CI runs `e18e analyze`.

## CI

Call the reusable workflow, SHA-pinned (renovate bumps it). A `bun.lock` switches it to Bun.

```yaml
jobs:
  ci:
    uses: lzear/forge/.github/workflows/ci.yml@<sha> # v4.3.0
    secrets:
      CODACY_PROJECT_TOKEN: ${{ secrets.CODACY_PROJECT_TOKEN }}
    # inputs: node-version, coverage-command, run-check
  release:
    if: github.event_name == 'push'
    needs: ci
    uses: lzear/forge/.github/workflows/release.yml@<sha> # v4.5.0
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    # inputs: node-version, version-script, jsr, snapshot-branch
```

Release needs `@lzear/configs` as a dev dep and the npm trusted publisher set to `<owner>/<repo>` / `main.yml`.

Custom jobs: `uses: lzear/forge/actions/setup@<sha>` (node + corepack + cache + install; inputs `node-version`, `cache`, `install-command`).

Renovate: `"extends": ["github>lzear/forge"]` (digest-pinned actions, updates wait 3 days except own packages, patches automerged after 7).

## Development

```sh
yarn qa          # build + typecheck + lint + test + forge check
yarn changeset   # then merge to main
```

`main` → "Version Packages" PR → merge → staged on npm (`npm stage approve`), published to JSR, GitHub release. Prereleases: `yarn changeset pre enter beta|rc`, `yarn changeset pre exit`.
