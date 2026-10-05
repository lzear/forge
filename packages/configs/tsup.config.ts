import { defineLibConfig } from './src/tsup.ts'

export default defineLibConfig({
  commitlint: 'src/commitlint.ts',
  'commitlint.emoji': 'src/commitlint-emoji.ts',
  vitest: 'src/vitest.ts',
  'vitest.react': 'src/vitest.react.ts',
  tsup: 'src/tsup.ts',
  vite: 'src/vite.ts',
})
