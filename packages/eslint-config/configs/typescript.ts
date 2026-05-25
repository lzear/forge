import type { Linter } from 'eslint'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'

export const typescript = async (
  config: ConfigOptions,
): Promise<Linter.Config[]> => {
  if (!config.typescript) {
    return []
  }

  const { parser: typescriptParser } = await interopDefault(
    import('typescript-eslint'),
  )

  const files = ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts']

  return defineConfig({
    name: 'lzear/typescript',

    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],

    files,

    rules: {
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
