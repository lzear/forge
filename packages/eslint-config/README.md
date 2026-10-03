# @lzear/eslint-config

[![npm](https://img.shields.io/npm/v/@lzear/eslint-config)](https://www.npmjs.com/package/@lzear/eslint-config)
[![license](https://img.shields.io/npm/l/@lzear/eslint-config)](../../LICENSE)

ESLint flat config for [forge](https://github.com/lzear/forge) repos. Node ≥ 24, ESLint ≥ 10.

```sh
yarn add -D @lzear/eslint-config eslint
```

```ts
// eslint.config.ts
import lzearConfig, { FILES } from '@lzear/eslint-config'

export default [
  ...(await lzearConfig({ react: false })), // node, react, typescript, vitest: all default true
  { files: FILES.TESTS, rules: { 'no-console': 'off' } },
  { ignores: ['src/generated/**'] },
]
```

- Unused disable directives and inline configs are errors.
- Test files relax `no-non-null-assertion`, `no-unsafe-*` and `sonarjs/no-duplicate-string`.
- Each layer is exported too (`core`, `react`, `node`, `typescript`, `vitest`, `a11y`, `packageJson`, `prettier`, `ignores`), for replacing one wholesale.
