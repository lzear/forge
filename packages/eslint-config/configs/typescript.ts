import type { Linter } from 'eslint'
import { defineConfig } from 'eslint/config'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

// sonarjs rules tsc or typescript-eslint already enforce on TS files
const sonarDuplicates = {
  'sonarjs/argument-type': 0, // tsc
  'sonarjs/deprecation': 0, // @typescript-eslint/no-deprecated
  'sonarjs/different-types-comparison': 0, // tsc (TS2367)
  'sonarjs/in-operator-type-error': 0, // tsc (TS2361)
  'sonarjs/no-array-delete': 0, // @typescript-eslint/no-array-delete
  'sonarjs/no-unused-vars': 0, // @typescript-eslint/no-unused-vars
  'sonarjs/no-useless-intersection': 0, // @typescript-eslint/no-redundant-type-constituents
  'sonarjs/unused-import': 0, // @typescript-eslint/no-unused-vars
} as const satisfies Linter.RulesRecord

export const typescript = async (
  config: ConfigOptions,
): Promise<Linter.Config[]> => {
  if (!config.typescript) return []

  const tseslint = await interopDefault(import('typescript-eslint'))

  const files = [...FILES.TS, ...FILES.TSX]

  return defineConfig({
    name: 'lzear/typescript',

    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],

    files,

    rules: {
      // `stylisticTypeChecked` picks `interface`
      '@typescript-eslint/consistent-type-definitions': [2, 'type'],
      '@typescript-eslint/consistent-type-imports': [
        2,
        { fixStyle: 'inline-type-imports' },
      ],
      // verbatimModuleSyntax compiles `import { type A } from 'x'` to `import 'x'`
      '@typescript-eslint/no-import-type-side-effects': 2,
      '@typescript-eslint/no-misused-promises': [
        2,
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-unnecessary-condition': [
        2,
        { allowConstantLoopConditions: 'only-allowed-literals' },
      ],
      '@typescript-eslint/no-unused-vars': [
        2,
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-unused-expressions': [2, { allowTernary: true }],
      // TanStack Router's `throw redirect()` / `throw notFound()`
      '@typescript-eslint/only-throw-error': [
        2,
        {
          allow: [
            {
              from: 'package',
              package: '@tanstack/router-core',
              name: ['Redirect', 'NotFoundError'],
            },
          ],
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        2,
        { allowNumber: true },
      ],
      // Off: `prefer-inline` rewrites `import type { A }` into the side effect above
      'import-x/consistent-type-specifier-style': 0,
      ...sonarDuplicates,
    },

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: config.react },
        ecmaVersion: 'latest',
        projectService: true,
        sourceType: 'module',
      },
    },
  })
}
