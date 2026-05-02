import type { ESLint, Linter } from 'eslint'
import * as packageJsonPlugin from 'eslint-plugin-package-json'
import * as jsoncParser from 'jsonc-eslint-parser'
import { plugin as lzearPlugin } from '../plugin'

export const packageJson = (): Linter.Config => ({
  name: 'lzear/package-json',

  files: ['**/package.json'],

  plugins: {
    lzear: lzearPlugin,
    'package-json': packageJsonPlugin as unknown as ESLint.Plugin,
  },

  languageOptions: {
    parser: jsoncParser,
  },

  rules: {
    ...packageJsonPlugin.configs.recommended.rules,
    'lzear/major-version-only': 2,
    'package-json/repository-shorthand': [2, { form: 'shorthand' }],
  },
})
