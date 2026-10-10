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

Defaults come from the dependencies in the cwd's `package.json` and its workspaces'; explicit options win.

| Option       | Default                                    | Effect                                              |
|--------------|--------------------------------------------|-----------------------------------------------------|
| `node`       | `true`                                     | enable the layer                                    |
| `react`      | `react` is a dependency                    | enable the layer                                    |
| `typescript` | `typescript` is one, or a `tsconfig.json`  | enable the layer                                    |
| `vitest`     | `vitest` is a dependency                   | enable the layer                                    |
| `local`      |                                            | npm scope whose imports sort after third-party ones |

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
On TS files, sonarjs rules that tsc or typescript-eslint already enforce are off; `sonarjs/aws-*` everywhere. `only-throw-error` allows TanStack Router's `redirect()` and `notFound()`. The `n` layer leaves Node builtins alone in JSX/TSX (browser code). react-x reads the installed React version.

Adding your own `no-restricted-syntax` replaces forge's: spread `RESTRICTED_SYNTAX` into it.

```ts
import { FILES, RESTRICTED_SYNTAX } from '@lzear/eslint-config'

const restricted = {
  files: FILES.REACT,
  rules: {
    'no-restricted-syntax': [2, ...RESTRICTED_SYNTAX, { selector: 'WithStatement', message: 'No with.' }],
  },
}
```

## Rules

- `lzear/prefer-relative-imports` (fixable): an aliased import inside the same package becomes relative when shorter, up to `maxParentPrefixes` `../` (default 1).
- `lzear/major-version-only` (fixable): `^1.2.3` → `^1`, `^0.5.4` → `^0.5`. `ignore` takes package names or `{ regex }`.
