import type { Linter } from 'eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'

export const vitest = async (config: ConfigOptions): Promise<Linter.Config> => {
  if (!config.vitest) return {}

  const vitestPlugin = await interopDefault(import('@vitest/eslint-plugin'))

  const files = [
    '**/test/*.js',
    '**/test/*.cjs',
    '**/test/*.mjs',
    '**/*.test.js',
    '**/*.test.cjs',
    '**/*.test.mjs',
  ]

  if (config.typescript)
    files.push(
      '**/test/*.ts',
      '**/test/*.cts',
      '**/test/*.mts',
      '**/*.test.ts',
      '**/*.test.cts',
      '**/*.test.mts',
    )

  if (config.react) {
    files.push('**/test/*.jsx', '**/*.test.jsx')

    if (config.typescript) files.push('**/test/*.tsx', '**/*.test.tsx')
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
    },

    settings: {
      vitest: {
        typecheck: true,
      },
    },
  }
}
