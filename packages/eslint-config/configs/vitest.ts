import { type Linter } from 'eslint'
import { type ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

export const vitest = async (config: ConfigOptions): Promise<Linter.Config> => {
  if (!config.vitest) return {}

  const vitestPlugin = await interopDefault(import('@vitest/eslint-plugin'))

  const files = [...FILES.TEST_JS]

  if (config.typescript) files.push(...FILES.TEST_TS)

  if (config.react) {
    files.push(...FILES.TEST_JSX)

    if (config.typescript) files.push(...FILES.TEST_TSX)
  }

  return {
    name: 'lzear/vitest',

    files,

    plugins: {
      vitest: vitestPlugin,
    },

    rules: {
      ...vitestPlugin.configs.recommended.rules,
      'vitest/consistent-test-it': [2, { fn: 'it' }],
      // Using Vitest globals mode — explicit imports not required
      'vitest/prefer-importing-vitest-globals': 0,

      // Mocks/fixtures routinely need loose typing and forced-unwraps
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/no-unsafe-argument': 0,
      '@typescript-eslint/no-unsafe-assignment': 0,
      '@typescript-eslint/no-unsafe-call': 0,
      '@typescript-eslint/no-unsafe-member-access': 0,
      '@typescript-eslint/no-unsafe-return': 0,
      'sonarjs/no-duplicate-string': 0,
    },

    settings: {
      vitest: {
        typecheck: true,
      },
    },
  }
}
