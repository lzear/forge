import { Linter } from 'eslint'
import prettierConfig from 'eslint-plugin-prettier/recommended'

const { curly: _curly, ...prettierRules } = prettierConfig.rules ?? {}

export const prettier: Linter.Config = {
  ...prettierConfig,
  rules: {
    ...prettierRules,
    'prettier/prettier': [
      2,
      {
        semi: false,
        singleQuote: true,
      },
    ],
  },
}
