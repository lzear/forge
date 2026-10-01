/**
 * Commitlint config requiring every commit header to start with an emoji.
 *
 * ```ts
 * // commitlint.config.ts
 * export { default } from '@lzear/configs/commitlint/emoji'
 * ```
 *
 * @module
 */

import { RuleConfigSeverity, type UserConfig } from '@commitlint/types'

const emojiRegex = /^\p{Extended_Pictographic}/u

/**
 * The config, ready to default-export from the consumer's config file.
 */
const config: UserConfig = {
  plugins: [
    {
      rules: {
        'start-with-emoji': ({ header }) => [
          emojiRegex.test(header ?? ''),
          'commit message must start with an emoji',
        ],
      },
    },
  ],
  rules: {
    'start-with-emoji': [RuleConfigSeverity.Error, 'always'],
  },
}

export default config
