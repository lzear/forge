# @lzear/forge

[![npm](https://img.shields.io/npm/v/@lzear/forge)](https://www.npmjs.com/package/@lzear/forge)
[![jsr](https://jsr.io/badges/@lzear/forge)](https://jsr.io/@lzear/forge)
[![license](https://img.shields.io/npm/l/@lzear/forge)](../../LICENSE)

One dev dependency for all [forge](https://github.com/lzear/forge) tooling, plus the `forge` CLI. Node ≥ 24.

```sh
yarn add -D @lzear/forge
```

## CLI

`check`, `update` and `setup` take `--json`.

- `forge init [--lib|--app] [--react] [--bun|--yarn] [--dry]` — scaffold a forge repo, writing only missing files ([Adopt](https://github.com/lzear/forge#adopt)), workflows pinned to this version's release; prints the steps left, then runs `forge check --skip-remote` once the dev deps are installed.
- `forge check [--skip-remote] [--only <ids>] [--skip <ids>] [--fix]` — audit the repo against forge standards ([checks](https://www.npmjs.com/package/@lzear/repo-lint#checks), [skipping](https://www.npmjs.com/package/@lzear/repo-lint#skipping-checks)); `--fix` repairs what it can ([fixes](https://www.npmjs.com/package/@lzear/repo-lint#fixes)), then checks again; a coding agent sees failures only.
- `forge update [--dry] [--no-install]` — bump dependency ranges (ncu, versions ≥ 3 days old except own packages, honors `.ncurc`, skips workspaces that are git submodules), `packageManager`, `.nvmrc`/`.node-version`/`.bun-version` and the LICENSE year, then install and dedupe.
- `forge setup [--repo owner/name] [--dry]` — set the `CODACY_PROJECT_TOKEN` GitHub secret, for the optional Codacy coverage upload.
- `forge sync [--dry] [--check]` — write `.editorconfig`, `lefthook.yml` and `.github/zizmor.yml` from the templates bundled with this version, and update `.codacy.yml` where it exists; `--check` exits 1 on drift.

## Re-exports

- `@lzear/forge/eslint` → [`@lzear/eslint-config`](https://www.npmjs.com/package/@lzear/eslint-config) (npm only)
- `@lzear/forge/{tsconfig/*,tsdown,vite,vitest,vitest/react,commitlint,commitlint/emoji}` → [`@lzear/configs`](https://www.npmjs.com/package/@lzear/configs)
- `@lzear/forge/repo-lint` → [`@lzear/repo-lint`](https://www.npmjs.com/package/@lzear/repo-lint)
