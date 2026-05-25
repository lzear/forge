import type { Linter } from 'eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'

export const node = async (config: ConfigOptions): Promise<Linter.Config> => {
  if (!config.node) return {}

  const nodePlugin = await interopDefault(import('eslint-plugin-n'))

  const files = ['**/*.js', '**/*.cjs', '**/*.mjs']

  if (config.typescript) files.push('**/*.ts', '**/*.cts', '**/*.mts')

  if (config.react) {
    files.push('**/*.jsx')

    if (config.typescript) files.push('**/*.tsx')
  }

  return {
    name: 'lzear/node',

    files,

    plugins: {
      n: nodePlugin,
    },

    rules: {
      ...nodePlugin.configs['flat/recommended'].rules,
      'n/hashbang': 0,
      // n resolver doesn't understand TypeScript imports; TypeScript handles this
      'n/no-extraneous-import': 0,
      'n/no-missing-import': 0,
      'n/no-process-exit': 0,
    },

    settings: {
      // Align with the minimum version where import.meta.dirname is stable
      node: { version: '>=22.16.0' },
    },
  }
}
