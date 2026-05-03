import conventional from '@commitlint/config-conventional'
import type { UserConfig } from '@commitlint/types'

const config: UserConfig = {
  ...conventional,
  rules: {
    ...conventional.rules,
    'header-max-length': [2, 'always', 100],
  },
}

export default config
