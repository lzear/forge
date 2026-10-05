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
- **[`@lzear/eslint-config`](packages/eslint-config)** — ESLint flat config (npm only, [inspector](https://lzear.github.io/forge/))
- **[`@lzear/repo-lint`](packages/repo-lint)** — repo compliance checker

## Adopt

```sh
yarn add -D @lzear/forge lefthook @commitlint/cli
yarn forge sync    # .editorconfig, .codacy.yml, lefthook.yml, .github/zizmor.yml
yarn forge setup   # CODACY_PROJECT_TOKEN secret
```

`lefthook.yml` runs `eslint --fix` on staged files and commitlint, under any package manager: add `"prepare": "lefthook install"` and a `commitlint.config.ts` (`export { default } from '@lzear/forge/commitlint'`). Then extend the [configs](packages/configs) and [ESLint config](packages/eslint-config), wire up [CI](#ci) and Renovate, and run `yarn forge check` until it passes ([checks](packages/repo-lint#checks)).

Complements [e18e](https://e18e.dev): the ESLint config runs `e18e/ban-dependencies`, CI runs `e18e analyze`.

## CI

Call the reusable workflow, SHA-pinned (renovate bumps it). It runs the `build`, `typecheck`, `lint` and `test` scripts (tests with coverage), then advisory `forge check`, fallow and `e18e analyze`, uploads coverage to Codacy and audits workflows with zizmor. A `bun.lock` switches it to Bun.

```yaml
jobs:
  ci:
    uses: lzear/forge/.github/workflows/ci.yml@<sha> # v4.3.0
    secrets:
      CODACY_PROJECT_TOKEN: ${{ secrets.CODACY_PROJECT_TOKEN }}
    # with:
    #   node-version: '26'
    #   coverage-command: yarn test --coverage
    #   run-check: true # forge check
  release:
    if: github.event_name == 'push'
    needs: ci
    uses: lzear/forge/.github/workflows/release.yml@<sha> # v4.5.0
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    # with:
    #   node-version: '26'
    #   version-script: yarn changeset version
    #   jsr: false # also deno publish
    #   snapshot-branch: '' # stage a `snapshot` dist-tag on every push to it
```

Release needs `@lzear/configs` as a dev dep and the npm trusted publisher set to `<owner>/<repo>` / `main.yml`.

Custom jobs: `uses: lzear/forge/actions/setup@<sha>` (node + corepack + cache + install; inputs `node-version`, `cache`, `install-command`).

Renovate: `"extends": ["github>lzear/forge"]` (digest-pinned actions, updates wait 3 days except own packages, patches automerged after 7).

## Development

```sh
yarn qa          # build + typecheck + lint + test + forge check
yarn changeset   # then merge to main
```

`main` → "Version Packages" PR → merge → staged on npm (`npm stage approve`), published to JSR, GitHub release. Prereleases: `yarn changeset pre enter beta|rc`, `yarn changeset pre exit`. Alpha/beta without a release: `yarn lzear-prerelease beta --publish`.
