import type { Linter } from 'eslint'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

export const typescript = async (
  config: ConfigOptions,
): Promise<Linter.Config[]> => {
  if (!config.typescript) return []

  const { parser: typescriptParser } = await interopDefault(
    import('typescript-eslint'),
  )

  const files = [...FILES.TS, ...FILES.TSX]

  return defineConfig({
    name: 'lzear/typescript',

    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],

    files,

    rules: {
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
      '@typescript-eslint/restrict-template-expressions': [
        2,
        { allowNumber: true },
      ],
      // Off: `prefer-inline` rewrites `import type { A }` into the side effect above
      'import-x/consistent-type-specifier-style': 0,
    },

    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: { jsx: config.react },
        ecmaVersion: 'latest',
        projectService: true,
        sourceType: 'module',
        tsconfigRootDir: process.cwd(),
      },
    },
  })
}
