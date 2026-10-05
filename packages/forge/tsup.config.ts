import { defineBinConfig, defineLibConfig } from '@lzear/configs/tsup'

export default [
  defineLibConfig({
    commitlint: 'src/commitlint.ts',
    'commitlint.emoji': 'src/commitlint-emoji.ts',
    eslint: 'src/eslint.ts',
    vitest: 'src/vitest.ts',
    'vitest.react': 'src/vitest.react.ts',
    tsup: 'src/tsup.ts',
    vite: 'src/vite.ts',
    'repo-lint': 'src/repo-lint.ts',
  }),
  defineBinConfig({ bin: 'src/bin.ts' }),
]
