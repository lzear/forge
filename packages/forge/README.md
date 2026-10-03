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

- `forge check [--skip-remote]` — audit the repo against forge standards ([checks](https://www.npmjs.com/package/@lzear/repo-lint#checks)).
- `forge update [--dry] [--no-install]` — bump dependency ranges (ncu, versions ≥ 3 days old except own packages, honors `.ncurc`), `packageManager`, `.nvmrc`/`.node-version`/`.bun-version` and the LICENSE year, then install and dedupe.
- `forge setup [--repo owner/name] [--dry]` — set the `CODACY_PROJECT_TOKEN` GitHub secret.
- `forge sync [--dry]` — write `.editorconfig`, `.codacy.yml`, `lefthook.yml` and `.github/zizmor.yml` from forge `main`.

## Re-exports

- `@lzear/forge/eslint` → [`@lzear/eslint-config`](https://www.npmjs.com/package/@lzear/eslint-config) (npm only)
- `@lzear/forge/{tsconfig/*,tsup,vite,vitest,vitest/react,commitlint,commitlint/emoji}` → [`@lzear/configs`](https://www.npmjs.com/package/@lzear/configs)
- `@lzear/forge/repo-lint` → [`@lzear/repo-lint`](https://www.npmjs.com/package/@lzear/repo-lint)
