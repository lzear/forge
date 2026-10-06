import { defineLibConfig } from './src/tsdown.ts'

export default defineLibConfig({
  commitlint: 'src/commitlint.ts',
  'commitlint.emoji': 'src/commitlint-emoji.ts',
  vitest: 'src/vitest.ts',
  'vitest.react': 'src/vitest.react.ts',
  tsup: 'src/tsup.ts',
  tsdown: 'src/tsdown.ts',
  vite: 'src/vite.ts',
})
