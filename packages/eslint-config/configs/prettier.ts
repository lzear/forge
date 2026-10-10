import type { Linter } from 'eslint'
import prettierConfig from 'eslint-plugin-prettier/recommended'
import type { ConfigOptions } from '../index'
import * as FILES from './files'

const { curly: _curly, ...prettierRules } = prettierConfig.rules ?? {}

const options = { semi: false, singleQuote: true }

export const prettier: Linter.Config = {
  ...prettierConfig,
  rules: {
    ...prettierRules,
    'prettier/prettier': [2, options],
  },
}

// The data layers' files Prettier formats otherwise: each needs its layer on,
// or ESLint would parse it as JS
export const prettierOverrides = (config: ConfigOptions): Linter.Config[] =>
  (
    [
      config.json && {
        name: 'lzear/prettier/deno-json',
        files: ['**/deno.json'],
        // Prettier's for package.json: `lzear-sync-jsr` writes JSON.stringify's
        rules: {
          'prettier/prettier': [2, { ...options, parser: 'json-stringify' }],
        },
      },
      config.yaml && {
        name: 'lzear/prettier/yarnrc',
        files: ['**/.yarnrc.yml'],
        // Yarn quotes with "
        rules: { 'prettier/prettier': [2, { ...options, singleQuote: false }] },
      },
      config.markdown && {
        name: 'lzear/prettier/markdown-code',
        files: FILES.MARKDOWN_CODE,
        // Prettier formats them with their Markdown file
        rules: { 'prettier/prettier': 0 },
      },
    ] satisfies (Linter.Config | false)[]
  ).filter((item) => item !== false)
