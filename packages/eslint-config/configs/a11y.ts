import { type Linter } from 'eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import { type ConfigOptions } from '../index'
import * as FILES from './files'

export const a11y = (config: ConfigOptions): Linter.Config => {
  if (!config.react) return {}

  const files = config.typescript ? FILES.REACT : FILES.JSX

  return {
    name: 'lzear/a11y',

    files,

    // the fork under the original's name, so `jsx-a11y/` disables still match
    plugins: {
      'jsx-a11y': jsxA11y,
    },

    rules: Object.fromEntries(
      Object.entries<Linter.RuleEntry>(jsxA11y.configs.recommended.rules).map(
        ([id, entry]) => [id.replace('jsx-a11y-x/', 'jsx-a11y/'), entry],
      ),
    ),
  }
}
