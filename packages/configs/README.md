# @lzear/configs

[![npm](https://img.shields.io/npm/v/@lzear/configs)](https://www.npmjs.com/package/@lzear/configs)
[![jsr](https://jsr.io/badges/@lzear/configs)](https://jsr.io/@lzear/configs)
[![license](https://img.shields.io/npm/l/@lzear/configs)](../../LICENSE)

tsconfig, tsup, vitest, vite and commitlint configs for [forge](https://github.com/lzear/forge) repos. Node ≥ 24.

```sh
yarn add -D @lzear/configs
```

Peers are optional: install the tools you use (`tsup`, `vite`, `vitest`, `jsdom`, `@vitejs/plugin-react`).

```jsonc
// tsconfig.json
{ "extends": "@lzear/configs/tsconfig/lib" }
```

- `base`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnused*`.
- `app`: base + ES2025, bundler resolution, `noEmit`.
- `lib`: base + ES2025, bundler resolution, dts, declaration and source maps.
- `react`: base + ES2022, DOM, `react-jsx`, `.ts` import extensions, `noEmit`.

```ts
// tsup.config.ts — ESM; lib emits dts and cleans, bin adds a shebang and doesn't clean
import { defineBinConfig, defineLibConfig } from '@lzear/configs/tsup'

export default [
  defineLibConfig({ index: 'src/index.ts' }),
  defineBinConfig({ bin: 'src/bin.ts' }),
]
```

```ts
// vitest.config.ts — or '@lzear/configs/vitest/react' (jsdom)
export { default } from '@lzear/configs/vitest'
```

Globals and v8 coverage (json, lcov, text): add `@vitest/coverage-v8`, and `"types": ["vitest/globals"]` to `tsconfig.json`.

Under a coding agent ([std-env](https://github.com/unjs/std-env) `isAgent`, which Vitest also reads for its `minimal` reporter), tsup builds are silent and Vite logs warnings and errors only: agents re-read tool output every turn.

```ts
// vite.config.ts — React plugin; overrides merge shallowly
import { defineReactConfig } from '@lzear/configs/vite'

export default defineReactConfig()
```

```ts
// commitlint.config.ts — Conventional Commits, header ≤ 100
export { default } from '@lzear/configs/commitlint'
```

To require a leading emoji too, merge in `@lzear/configs/commitlint/emoji`:

```ts
import base from '@lzear/configs/commitlint'
import emoji from '@lzear/configs/commitlint/emoji'

export default {
  ...base,
  plugins: [...(base.plugins ?? []), ...(emoji.plugins ?? [])],
  rules: { ...base.rules, ...emoji.rules },
}
```

## Bins

Run from the repo root.

- `lzear-publish [--publish] [--release] [--tag <tag>]` — stage unpublished workspace packages on npm (dry run without `--publish`), create the GitHub release with `--release`. Tag defaults to the prerelease id, else `latest`.
- `lzear-prerelease <alpha|beta|…> [--publish]` — publish the pending changesets as `<next version>-<id>.<N>` under dist-tag `<id>`, without committing (dry run without `--publish`); npm asks for 2FA.
- `lzear-changelog` — prepend the pending release to the root `CHANGELOG.md`; run before `changeset version`.
- `lzear-sync-jsr [--check]` — generate each `deno.json` from `package.json` + tsup entries; `--check` fails instead of writing.
