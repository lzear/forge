# @lzear/configs

[![npm](https://img.shields.io/npm/v/@lzear/configs)](https://www.npmjs.com/package/@lzear/configs)
[![jsr](https://jsr.io/badges/@lzear/configs)](https://jsr.io/@lzear/configs)
[![license](https://img.shields.io/npm/l/@lzear/configs)](../../LICENSE)

tsconfig, tsup, vitest, vite and commitlint configs for [forge](https://github.com/lzear/forge) repos. Node ≥ 24.

```sh
yarn add -D @lzear/configs
```

```jsonc
// tsconfig.json — presets: app, lib (emits dts), react
{ "extends": "@lzear/configs/tsconfig/lib" }
```

```ts
// tsup.config.ts
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

```ts
// vite.config.ts
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

Bins: `lzear-publish` (stage on npm, GitHub release), `lzear-changelog` (root `CHANGELOG.md`), `lzear-sync-jsr` (generate `deno.json`).
