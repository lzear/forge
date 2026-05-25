import type { Linter } from 'eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import type { ConfigOptions } from '../index'

export const a11y = (config: ConfigOptions): Linter.Config => {
  if (!config.react) return {}

  const files = ['**/*.jsx']

  if (config.typescript) files.push('**/*.tsx')

  return {
    name: 'lzear/a11y',

    files,

    plugins: {
      'jsx-a11y': jsxA11y,
    },

    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  }
}
