import js from '@eslint/js'
import eslintCommentsPlugin from '@eslint-community/eslint-plugin-eslint-comments'
import type { ESLint, Linter } from 'eslint'
import deMorganPlugin from 'eslint-plugin-de-morgan'
import importXPlugin from 'eslint-plugin-import-x'
import preferArrowPlugin from 'eslint-plugin-prefer-arrow'
import promisePlugin from 'eslint-plugin-promise'
import regexpPlugin from 'eslint-plugin-regexp'
import sonarjsPlugin from 'eslint-plugin-sonarjs'
import unicornPlugin from 'eslint-plugin-unicorn'
import globals from 'globals'
import { plugin as lzearPlugin } from '../plugin'

export const core = (): Linter.Config => {
  const files = [
    '**/*.js',
    '**/*.cjs',
    '**/*.mjs',
    '**/*.ts',
    '**/*.cts',
    '**/*.mts',
    '**/*.jsx',
    '**/*.tsx',
  ]

  const sonarRules = (
    sonarjsPlugin.configs?.recommended as { rules?: Linter.RulesRecord }
  ).rules

  const rules = {
    ...js.configs.recommended.rules,

    ...eslintCommentsPlugin.configs.recommended.rules,
    '@eslint-community/eslint-comments/disable-enable-pair': 0,
    '@eslint-community/eslint-comments/no-unlimited-disable': 0,

    ...deMorganPlugin.configs.recommended.rules,

    ...importXPlugin.configs.recommended.rules,
    'import-x/no-named-as-default-member': 0,
    'import-x/no-unresolved': 0,
    'import-x/order': [
      2,
      {
        alphabetize: { order: 'asc', orderImportKind: 'asc' },
        'newlines-between': 'never',
      },
    ],

    'lzear/prefer-relative-imports': 2,

    'prefer-arrow/prefer-arrow-functions': [
      2,
      {
        classPropertiesAllowed: false,
        disallowPrototype: true,
        singleReturnOnly: false,
      },
    ],

    ...promisePlugin.configs.recommended.rules,

    ...regexpPlugin.configs.recommended.rules,

    ...sonarRules,
    'sonarjs/fixme-tag': 0,
    'sonarjs/no-invariant-returns': 0, // annoying
    'sonarjs/no-os-command-from-path': 0, // annoying
    'sonarjs/os-command': 0, // annoying
    'sonarjs/prefer-read-only-props': 0, // annoying
    'sonarjs/pseudo-random': 0,
    'sonarjs/todo-tag': 0,
    'sonarjs/void-use': 0,

    ...unicornPlugin.configs.recommended.rules,
    'unicorn/no-abusive-eslint-disable': 0,
    'unicorn/no-null': 0,
    'unicorn/prevent-abbreviations': 0,
  } satisfies Linter.RulesRecord

  return {
    name: 'lzear/core',

    files,

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2025,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },

    plugins: {
      '@eslint-community/eslint-comments': eslintCommentsPlugin,
      'de-morgan': deMorganPlugin,
      'import-x': importXPlugin as unknown as ESLint.Plugin,
      lzear: lzearPlugin,
      'prefer-arrow': preferArrowPlugin,
      promise: promisePlugin,
      regexp: regexpPlugin,
      sonarjs: sonarjsPlugin,
      unicorn: unicornPlugin,
    },

    rules,

    settings: {
      // import-x uses import-x/resolver; eslint-module-utils (used by lzear/prefer-relative-imports) reads import/resolver
      'import-x/resolver': { typescript: true },
      'import/resolver': { typescript: true },
    },
  }
}
