/**
 * Commitlint config: conventional commits with a 100-character header limit.
 *
 * ```ts
 * // commitlint.config.ts
 * export { default } from '@lzear/configs/commitlint'
 * ```
 *
 * @module
 */

import conventional from '@commitlint/config-conventional'
import { RuleConfigSeverity, type UserConfig } from '@commitlint/types'

/**
 * The config, ready to default-export from the consumer's config file.
 */
const config: UserConfig = {
  ...conventional,
  rules: {
    ...conventional.rules,
    'header-max-length': [RuleConfigSeverity.Error, 'always', 100],
  },
}

export default config
