import { type Linter } from 'eslint'
import packageJsonPlugin from 'eslint-package-json'
import { plugin as lzearPlugin } from '../plugin'
import * as FILES from './files'

export const packageJson = (): Linter.Config[] => [
  packageJsonPlugin.configs.recommended,
  {
    name: 'lzear/package-json',

    files: FILES.PACKAGE_JSON,

    plugins: {
      lzear: lzearPlugin,
    },

    rules: {
      'lzear/major-version-only': 2,
    },
  },
]
