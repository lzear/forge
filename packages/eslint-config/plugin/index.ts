import type { ESLint } from 'eslint'
import { majorVersionOnly } from './rules/major-version-only'
import { preferRelativeImports } from './rules/prefer-relative-imports'

export const plugin: ESLint.Plugin = {
  meta: {
    name: 'lzear',
    version: '1.0.0',
  },
  rules: {
    'major-version-only': majorVersionOnly,
    'prefer-relative-imports': preferRelativeImports,
  },
}
