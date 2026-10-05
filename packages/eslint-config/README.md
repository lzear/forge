# @lzear/eslint-config

[![npm](https://img.shields.io/npm/v/@lzear/eslint-config)](https://www.npmjs.com/package/@lzear/eslint-config)
[![license](https://img.shields.io/npm/l/@lzear/eslint-config)](../../LICENSE)

ESLint flat config for [forge](https://github.com/lzear/forge) repos. Node ≥ 24, ESLint ≥ 10.
Browse every rule in the [config inspector](https://lzear.github.io/forge/), or locally with `npx eslint --inspect-config`.

```sh
yarn add -D @lzear/eslint-config eslint
```

```ts
// eslint.config.ts
import lzearConfig, { FILES } from '@lzear/eslint-config'

export default [
  ...(await lzearConfig({ react: false, local: 'acme' })),
  { files: FILES.TESTS, rules: { 'no-console': 'off' } },
  { ignores: ['src/generated/**'] },
]
```

## Options

| Option                                  | Default | Effect                                              |
|-----------------------------------------|---------|-----------------------------------------------------|
| `node`, `react`, `typescript`, `vitest` | `true`  | enable the layer                                    |
| `local`                                 |         | npm scope whose imports sort after third-party ones |

## Layers

Each is exported too, for replacing one wholesale. `prettier` comes last so it overrides the rest.

| Layer         | Files            | Plugins                                                                                                                            |
|---------------|------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `core`        | JS, TS, JSX, TSX | `@eslint/js`, stylistic, unicorn, sonarjs, import-x, simple-import-sort, promise, regexp, de-morgan, eslint-comments, prefer-arrow |
| `typescript`  | TS, TSX          | typescript-eslint `strictTypeChecked` + `stylisticTypeChecked` (project service)                                                   |
| `react`       | JSX, TSX         | react-x, react-dom, react-web-api, react-hooks, react-compiler                                                                     |
| `a11y`        | JSX, TSX         | jsx-a11y-x, as `jsx-a11y`                                                                                                          |
| `node`        | JS, TS, JSX, TSX | n                                                                                                                                  |
| `vitest`      | tests            | `@vitest/eslint-plugin`; relaxes `no-non-null-assertion`, `no-unsafe-*` and `sonarjs/no-duplicate-string`                          |
| `packageJson` | `package.json`   | eslint-package-json, `e18e/ban-dependencies`, `lzear/major-version-only`                                                           |
| `prettier`    | all              | prettier: no semicolons, single quotes                                                                                             |
| `ignores`     |                  | `dist`, `coverage`, `build`, caches                                                                                                |

Arrow functions only, `curly: multi`, inline type imports, `it` over `test`. Unused disable directives and inline configs are errors.

## Rules

- `lzear/prefer-relative-imports` (fixable): an aliased import inside the same package becomes relative when shorter, up to `maxParentPrefixes` `../` (default 1).
- `lzear/major-version-only` (fixable): `^1.2.3` → `^1`, `^0.5.4` → `^0.5`. `ignore` takes package names or `{ regex }`.
