import conventional from '@commitlint/config-conventional'
import { RuleConfigSeverity, type UserConfig } from '@commitlint/types'

const config: UserConfig = {
  ...conventional,
  rules: {
    ...conventional.rules,
    'header-max-length': [RuleConfigSeverity.Error, 'always', 100],
  },
}

export default config
