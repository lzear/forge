import { RuleConfigSeverity, type UserConfig } from '@commitlint/types'

const emojiRegex = /^\p{Extended_Pictographic}/u

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
