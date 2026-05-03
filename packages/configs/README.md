# @lzear/configs

[![npm](https://img.shields.io/npm/v/@lzear/configs)](https://www.npmjs.com/package/@lzear/configs)
[![license](https://img.shields.io/npm/l/@lzear/configs)](../../LICENSE)

Shared configs for lzear repos: tsconfig, vitest, tsup, and vite.

## Install

```sh
npm install -D @lzear/configs
# or
yarn add -D @lzear/configs
```

Requires Node ≥ 20.

## tsconfig

Three presets available:

| Preset    | Entry point                          | Use for                   |
|-----------|--------------------------------------|---------------------------|
| `app`     | `@lzear/configs/tsconfig/app`        | Applications (no `dts`)   |
| `lib`     | `@lzear/configs/tsconfig/lib`        | Libraries (emits `dts`)   |
| `react`   | `@lzear/configs/tsconfig/react`      | React/JSX projects        |

**`tsconfig.json`:**

```json
{
  "extends": "@lzear/configs/tsconfig/lib"
}
```

Override individual options as needed:

```json
{
  "extends": "@lzear/configs/tsconfig/app",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

## tsup

```ts
// tsup.config.ts
import { defineLibConfig } from '@lzear/configs/tsup'

export default defineLibConfig({
  index: 'src/index.ts',
})
```

For packages with a CLI binary:

```ts
import { defineBinConfig, defineLibConfig } from '@lzear/configs/tsup'

export default [
  defineLibConfig({ index: 'src/index.ts' }),
  defineBinConfig({ bin: 'src/bin.ts' }),
]
```

## vitest

```ts
// vitest.config.ts
import config from '@lzear/configs/vitest'

export default config
```

For React projects (adds `jsdom` environment and `@vitejs/plugin-react`):

```ts
import config from '@lzear/configs/vitest/react'

export default config
```

## vite

```ts
// vite.config.ts
import config from '@lzear/configs/vite'

export default config
```

## Part of forge

This package is part of [forge](https://github.com/lzear/forge) — shared dev tooling for lzear repos.
