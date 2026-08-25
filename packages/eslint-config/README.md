# @lzear/eslint-config

[![npm](https://img.shields.io/npm/v/@lzear/eslint-config)](https://www.npmjs.com/package/@lzear/eslint-config)
[![license](https://img.shields.io/npm/l/@lzear/eslint-config)](../../LICENSE)

Shared ESLint flat config for lzear repos. Includes rules for TypeScript, React, Node, Vitest, imports, accessibility, and more.

## Install

```sh
npm install -D @lzear/eslint-config eslint
# or
yarn add -D @lzear/eslint-config eslint
```

Requires Node ≥ 20, ESLint ≥ 9.

## Usage

**Minimal `eslint.config.ts`:**

```ts
import lzearConfig from '@lzear/eslint-config'

export default await lzearConfig()
```

**With options** — disable feature sets you don't use:

```ts
import lzearConfig from '@lzear/eslint-config'

export default await lzearConfig({
  react: false,   // not a React project
  vitest: false,  // no tests
})
```

| Option       | Default | Description                              |
|--------------|---------|------------------------------------------|
| `typescript` | `true`  | TypeScript rules via `typescript-eslint` |
| `react`      | `true`  | React, hooks, a11y, compiler rules       |
| `node`       | `true`  | Node.js rules via `eslint-plugin-n`      |
| `vitest`     | `true`  | Vitest rules via `@vitest/eslint-plugin` |

**Extend with extra rules, overrides, and ignores:**

```ts
import type { Linter } from 'eslint'
import lzearConfig from '@lzear/eslint-config'

const base = await lzearConfig({ react: false })

const config: Linter.Config[] = [
  ...base,

  // Extra rules applied to all files
  {
    rules: {
      'no-console': 'error',
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    },
  },

  // Turn off or downgrade specific rules
  {
    rules: {
      'sonarjs/cognitive-complexity': 'off',
      'import-x/order': 'warn',
    },
  },

  // Override rules for specific files
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'unicorn/no-process-exit': 'off',
    },
  },

  // Ignore generated files and specific folders
  {
    ignores: [
      'src/generated/**',
      'public/**',
      '**/*.min.js',
    ],
  },
]

export default config
```

Unused `eslint-disable`/`eslint-enable` comments (`reportUnusedDisableDirectives`) and unused
inline rule-override comments like `/* eslint no-console: "error" */` (`reportUnusedInlineConfigs`)
are both reported as errors — neither is configurable via options.

**Reuse the file globs forge lints against**, so your overrides stay in sync instead of
hardcoding patterns by hand:

```ts
import { FILES } from '@lzear/eslint-config'

// e.g. FILES.TESTS, FILES.REACT, FILES.TS, FILES.JS, FILES.CORE, FILES.PACKAGE_JSON, ...
```

**Import an individual rule layer** to inspect or replace it wholesale instead of only
appending overrides on top:

```ts
import { react } from '@lzear/eslint-config'

const reactConfig = await react({ react: true, typescript: true } /* ...ConfigOptions */)
```

Every builder (`core`, `react`, `node`, `typescript`, `vitest`, `a11y`, `packageJson`,
`prettier`, `ignores`) is exported alongside the default `configGenerator`.

In test files (`vitest: true`, the default), a few strict-typing/style rules that fight mocking
and fixtures are turned off: `@typescript-eslint/no-non-null-assertion`, the
`@typescript-eslint/no-unsafe-*` family, and `sonarjs/no-duplicate-string`.

## Included plugins

`@eslint/js` · `typescript-eslint` · `eslint-plugin-unicorn` · `eslint-plugin-sonarjs` · `eslint-plugin-import-x` · `eslint-plugin-promise` · `eslint-plugin-regexp` · `eslint-plugin-react` · `eslint-plugin-react-hooks` · `eslint-plugin-jsx-a11y` · `eslint-plugin-n` · `@vitest/eslint-plugin` · `eslint-package-json` · `eslint-config-prettier` · and more.

## Part of forge

This package is part of [forge](https://github.com/lzear/forge) — shared dev tooling for lzear repos.
