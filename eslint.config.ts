import type { Linter } from 'eslint'
import lzearConfig from '@lzear/forge/eslint'

const base = await lzearConfig({ local: 'lzear' })

const config: Linter.Config[] = [
  ...base,
  {
    rules: {
      'package-json/no-workspace-protocol-in-published-package': 0,
    },
  },
  {
    // its tables await Prettier's realignment until the forge-review cli tasks,
    // which edit them, have landed
    files: ['packages/repo-lint/README.md'],
    rules: { 'prettier/prettier': 0 },
  },
]

export default config
