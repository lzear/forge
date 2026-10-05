# @lzear/repo-lint

[![npm](https://img.shields.io/npm/v/@lzear/repo-lint)](https://www.npmjs.com/package/@lzear/repo-lint)
[![jsr](https://jsr.io/badges/@lzear/repo-lint)](https://jsr.io/@lzear/repo-lint)
[![license](https://img.shields.io/npm/l/@lzear/repo-lint)](../../LICENSE)

Engine behind `forge check` and `forge update` ([forge](https://github.com/lzear/forge)). Node ≥ 24.

```ts
import { checkLocal, runUpdate } from '@lzear/repo-lint'

const { results } = await checkLocal({ dir, skipRemote }) // [{ pass, desc, detail? }]
const update = await runUpdate({ dir, dry, install })
```

## Checks

| Check                 | Passes when                                               |
|-----------------------|-----------------------------------------------------------|
| `readme-exists`       | `README.md` exists                                        |
| `readme-npm-badge`    | README has an npm badge                                   |
| `codacy`              | Codacy grade & coverage badges in README, `.codacy.yml`   |
| `license`             | `LICENSE` exists                                          |
| `jsr-config`          | `deno.json` name & version match `package.json`           |
| `ci-workflow`         | a workflow calls the forge reusable CI workflow           |
| `renovate`            | `renovate.json` extends `github>lzear/forge`              |
| `git-hooks`           | `lefthook.yml`, installed by `prepare` (Yarn) or Bun      |
| `pkg-publint`         | published packages pass `publint`                         |
| `pkg-attw`            | published packages pass `attw` (ESM-only profile)         |
| `pkg-size-limit`      | within `size-limit` budgets (where configured)            |
| `pkg-fallow`          | no unused files, exports or dependencies (`fallow`)       |
| `monorepo-lint`       | `sherif` passes (monorepos only)                          |
| `deps-audit`          | no high+ prod vulnerabilities (package manager `audit`)   |
| `deps-deprecated`     | no direct dependency resolves to a deprecated version     |
| `deps-fresh`          | dependencies up to date (`ncu`, honors `.ncurc`)          |
| `deps-release-age`    | package manager installs only versions ≥ 3 days old       |
| `secret-codacy-token` | GitHub secret `CODACY_PROJECT_TOKEN` is set               |
