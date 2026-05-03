import type { KnipConfig } from 'knip'

const config = {
  ignore: ['.ncurc.js'],
  ignoreDependencies: ['@changesets/cli'],
  workspaces: {
    'packages/repo-lint': {
      entry: ['src/index.ts', 'src/bin.ts'],
      ignoreDependencies: ['@arethetypeswrong/cli'],
    },
    'packages/eslint-config': {
      ignoreDependencies: ['eslint-import-resolver-typescript'],
    },
  },
} satisfies KnipConfig

export default config
