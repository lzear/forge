import js from '@eslint/js'
import eslintCommentsPlugin from '@eslint-community/eslint-plugin-eslint-comments'
import stylistic from '@stylistic/eslint-plugin'
import type { Linter } from 'eslint'
import { defaultConditionNames } from 'eslint-import-resolver-typescript'
import deMorganPlugin from 'eslint-plugin-de-morgan'
import importXPlugin from 'eslint-plugin-import-x'
import preferArrowPlugin from 'eslint-plugin-prefer-arrow'
import promisePlugin from 'eslint-plugin-promise'
import regexpPlugin from 'eslint-plugin-regexp'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import sonarjsPlugin from 'eslint-plugin-sonarjs'
import unicornPlugin from 'eslint-plugin-unicorn'
import globals from 'globals'
import { plugin as lzearPlugin } from '../plugin'
import * as FILES from './files'

// TS's versioned `types@>=5.5` condition (jotai 3 hides its types behind it): without it, `import-x/no-duplicates --fix` merges `jotai/utils` into `jotai`
const typescriptResolver = {
  conditionNames: ['types@>=5.5', ...defaultConditionNames],
}

export const core = (local?: string): Linter.Config => {
  const l = local?.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)

  const sonarRules = (
    sonarjsPlugin.configs?.recommended as
      { rules?: Linter.RulesRecord } | undefined
  )?.rules

  const rules = {
    ...js.configs.recommended.rules,
    curly: [2, 'multi'],

    ...eslintCommentsPlugin.configs.recommended.rules,
    '@eslint-community/eslint-comments/disable-enable-pair': 0,
    '@eslint-community/eslint-comments/no-unlimited-disable': 0,

    ...stylistic.configs.recommended.rules,
    '@stylistic/arrow-parens': 0,
    '@stylistic/brace-style': 0,
    '@stylistic/jsx-self-closing-comp': [2, { component: true, html: true }],

    ...deMorganPlugin.configs.recommended.rules,

    ...importXPlugin.configs.recommended.rules,
    'import-x/newline-after-import': 2,
    'import-x/no-duplicates': [2, { 'prefer-inline': true }],
    'import-x/no-extraneous-dependencies': 2,
    'import-x/no-named-as-default-member': 0,
    'import-x/no-relative-packages': 2,
    'import-x/no-unresolved': 0,
    'import-x/order': 0,

    'simple-import-sort/exports': 2,
    'simple-import-sort/imports': [
      2,
      {
        groups: [
          [
            '^node:',
            l && '^@?(?!' + l + String.raw`\/)\w`,
            l && '^@' + l + String.raw`\/`,
            '^',
            String.raw`^\.`,
            String.raw`^.+\.s?css$`,
          ].filter(Boolean),
        ],
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
    // no CDK in any repo
    ...Object.fromEntries(
      Object.keys(sonarRules ?? {})
        .filter((rule) => rule.startsWith('sonarjs/aws-'))
        .map((rule) => [rule, 0 as const]),
    ),
    'sonarjs/fixme-tag': 0,
    'sonarjs/function-return-type': 0, // flags any union return (`T | undefined`)
    'sonarjs/jsx-no-leaked-render': 0, // false positives (not checking types)
    'sonarjs/no-invariant-returns': 0, // annoying
    'sonarjs/no-nested-conditional': 0, // unnecessary
    'sonarjs/no-os-command-from-path': 0, // annoying
    'sonarjs/os-command': 0, // annoying
    'sonarjs/prefer-read-only-props': 0, // annoying
    'sonarjs/pseudo-random': 0,
    'sonarjs/todo-tag': 0,
    'sonarjs/void-use': 0,

    ...unicornPlugin.configs.recommended.rules,
    'unicorn/consistent-boolean-name': 0, // a bit annoying
    // `inline` wants a function declaration, which prefer-arrow forbids
    'unicorn/default-export-style': [2, { functions: 'separate' }],
    'unicorn/name-replacements': 0, // i like my abbreviations
    'unicorn/no-abusive-eslint-disable': 0,
    'unicorn/no-missing-local-resource': 2,
    'unicorn/no-null': 0,
    'unicorn/prefer-await': 0, // await fn().catch() is convenient
    'unicorn/prefer-error-is-error': 2,
    'unicorn/prefer-import-meta-properties': 2,
    // TypeScript's lib has no Iterator.concat yet
    'unicorn/prefer-iterator-concat': 0,
    'unicorn/prefer-json-import': 2,
    'unicorn/prefer-regexp-escape': 2,
    'unicorn/prefer-short-arrow-method': 2,
    'unicorn/prefer-temporal': 2,
    'unicorn/prefer-uint8array-base64': 2,
    'unicorn/prefer-uint8array-hex': 2,
    'unicorn/prevent-abbreviations': 0,
    'unicorn/require-post-message-target-origin': 2,
    'unicorn/switch-case-braces': [2, 'avoid'],
  } satisfies Linter.RulesRecord

  return {
    name: 'lzear/core',

    files: FILES.CORE,

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2026,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },

    plugins: {
      '@eslint-community/eslint-comments': eslintCommentsPlugin,
      '@stylistic': stylistic,
      'de-morgan': deMorganPlugin,
      'import-x': importXPlugin,
      lzear: lzearPlugin,
      'prefer-arrow': preferArrowPlugin,
      promise: promisePlugin,
      regexp: regexpPlugin,
      'simple-import-sort': simpleImportSort,
      sonarjs: sonarjsPlugin,
      unicorn: unicornPlugin,
    },

    rules,

    settings: {
      // import-x uses import-x/resolver; eslint-module-utils (used by lzear/prefer-relative-imports) reads import/resolver
      'import-x/resolver': { typescript: typescriptResolver },
      'import/resolver': { typescript: typescriptResolver },
    },
  }
}
