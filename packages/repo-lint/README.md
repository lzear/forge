# @lzear/repo-lint

[![npm](https://img.shields.io/npm/v/@lzear/repo-lint)](https://www.npmjs.com/package/@lzear/repo-lint)
[![jsr](https://jsr.io/badges/@lzear/repo-lint)](https://jsr.io/@lzear/repo-lint)
[![license](https://img.shields.io/npm/l/@lzear/repo-lint)](../../LICENSE)

Engine behind `forge init`, `forge check`, `forge update` and `forge sync` ([forge](https://github.com/lzear/forge)). Node ≥ 24.

```ts
import {
  checkLocal,
  initRepo,
  runUpdate,
  syncTemplates,
} from '@lzear/repo-lint'

const { results, skipped, fixed, pass } = await checkLocal({
  dir,
  skipRemote,
  only,
  skip,
  fix,
  strict,
}) // [{ pass, desc, detail?, drift? }], [{ id, desc, skipped }], fix runs: [{ pass, desc, detail? }], pass: drift aside unless strict
const update = await runUpdate({ dir, dry, install, only, skip }) // results: [{ id, desc, pass, changed, detail? }], steps: UPDATE_STEPS
const sync = await syncTemplates({ dir, dry }) // [{ file, status }], from templates/; `.codacy.yml` only where it exists
const init = await initRepo({ dir, kind, react, packageManager, dry, version }) // results: [{ file, status, detail? }], next: [steps left], isInstalled, from templates/init/
```

## Checks

| Check              | Drift | Passes when                                                                         |
| ------------------ | ----- | ----------------------------------------------------------------------------------- |
| `gitignore-env`    |       | `git check-ignore .env` succeeds                                                    |
| `readme-exists`    |       | `README.md` exists                                                                  |
| `readme-npm-badge` |       | README has an npm badge                                                             |
| `license`          |       | `LICENSE` exists                                                                    |
| `jsr-config`       |       | `deno.json` name & version match `package.json`                                     |
| `ci-workflow`      |       | a workflow calls the forge reusable CI workflow                                     |
| `forge-pins`       | ✓     | forge workflow/action pins are the latest `v*` tag                                  |
| `renovate`         |       | `renovate.json` extends `github>lzear/forge`                                        |
| `git-hooks`        |       | `lefthook.yml`, installed by `prepare` (Yarn) or Bun                                |
| `template-sync`    |       | shared files match [`templates/`](templates)                                        |
| `pkg-publint`      |       | published packages pass `publint`                                                   |
| `pkg-attw`         |       | published packages pass `attw` (ESM-only profile)                                   |
| `pkg-size-limit`   |       | within `size-limit` budgets (where configured)                                      |
| `pkg-fallow`       |       | no unused files, exports or dependencies (`fallow`)                                 |
| `monorepo-lint`    |       | `sherif` passes (monorepos only)                                                    |
| `deps-audit`       | ✓     | no high+ prod vulnerabilities (package manager `audit`; Bun's counts dev deps too)  |
| `deps-deprecated`  | ✓     | no direct dependency resolves to a deprecated version                               |
| `deps-fresh`       | ✓     | dependencies up to date (`ncu`, honors `.ncurc`)                                    |
| `deps-release-age` |       | package manager installs only versions ≥ 3 days old                                 |
| `renovate-active`  | ✓     | with `renovate.json`: open Dependency Dashboard, or a `renovate[bot]` PR in 60 days |
| `forge-config`     |       | the `forge` field below is valid (only when present)                                |

`forge check` exits 1 when a gate check fails: deterministic for a given tree. Drift checks fail on time instead (a forge release, a new version, an advisory): they print as warnings (`!`), counted apart (`18/20 checks passed, 2 drifted`), leaving the exit code at 0; `--strict` (`checkLocal({ strict: true })`) fails on them too. In `--json`, their results carry `drift: true`; the top-level `pass` ignores them unless strict.

`renovate-active`, the only remote check, queries GitHub through `gh` (`skipRemote`, `--skip-remote` skips it); with `gh` missing or logged out, or no GitHub repo (`forge.repo` or a github.com `origin`), a single `gh` result fails instead, drift while only drift checks need `gh`.

## Skipping checks

A repo opts out of a check in its root `package.json`, with a reason (`ForgeConfig`):

```json
{ "forge": { "skip": { "pkg-attw": "Bun app, nothing published for Node" } } }
```

`"repo": "<owner>/<name>"` names the GitHub repo when `origin` points elsewhere (remote checks, `forge init`); `gh secret set CODACY_PROJECT_TOKEN` needs `-R <owner>/<name>` then. An empty reason, an unknown id or a malformed `repo` fails `forge-config`. One run: `forge check --only <ids>` / `--skip <ids>` (comma-separated). Skips show in `--json` as `{ id, desc, skipped: reason }`.

## Fixes

`forge check --fix` (`checkLocal({ fix: true })`) runs the failing checks' fixes, then every check again; `fixed` (also in `--json`) lists what each changed, or why it couldn't.

| Check              | Fix                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `git-hooks`        | writes `lefthook.yml`; chains `lefthook install` onto `prepare` (replacing husky), or Bun's `trustedDependencies` |
| `renovate`         | creates `renovate.json`, or adds `github>lzear/forge` to `extends`                                                |
| `deps-release-age` | sets the age gate (`bunfig.toml`, `.npmrc`, `pnpm-workspace.yaml`, `yarn config set`)                             |
| `template-sync`    | `forge sync`                                                                                                      |
| `forge-pins`       | repins forge refs to the latest release: `@<sha> # vX.Y.Z`                                                        |

`deps-fresh` is `forge update`'s job.
