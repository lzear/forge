import type { Linter } from 'eslint'
import packageJsonPlugin from 'eslint-package-json'
import { plugin as lzearPlugin } from '../plugin'

export const packageJson = (): Linter.Config[] => [
  packageJsonPlugin.configs.recommended,
  {
    name: 'lzear/package-json',

    files: ['**/package.json'],

    plugins: {
      lzear: lzearPlugin,
    },

    rules: {
      'lzear/major-version-only': 2,
    },
  },
]
