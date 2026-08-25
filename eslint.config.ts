import { type Linter } from 'eslint'
import lzearConfig from '@lzear/forge/eslint'

const base = await lzearConfig({ local: 'lzear' })

const config: Linter.Config[] = [
  ...base,
  {
    rules: {
      'package-json/no-nested-exports': 0,
      'package-json/no-workspace-protocol-in-published-package': 0,
    },
  },
]

export default config
