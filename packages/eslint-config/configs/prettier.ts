import { Linter } from 'eslint'
import prettierConfig from 'eslint-plugin-prettier/recommended'

export const prettier: Linter.Config = {
  ...prettierConfig,
  rules: {
    ...prettierConfig.rules,
    'prettier/prettier': [
      2,
      {
        semi: false,
        singleQuote: true,
      },
    ],
  },
}
