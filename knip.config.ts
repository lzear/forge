import type { KnipConfig } from 'knip'

const config = {
  workspaces: {
    'packages/repo-lint': {
      entry: ['src/index.ts', 'src/bin.ts'],
      // spawned via node_modules/.bin, invisible to knip
      ignoreDependencies: ['@arethetypeswrong/cli', 'sherif'],
    },
    'packages/eslint-config': {
      ignoreDependencies: ['eslint-import-resolver-typescript'],
    },
  },
} satisfies KnipConfig

export default config
