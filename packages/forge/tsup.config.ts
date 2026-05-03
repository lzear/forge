import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      commitlint: 'src/commitlint.ts',
      'commitlint.emoji': 'src/commitlint-emoji.ts',
      eslint: 'src/eslint.ts',
      vitest: 'src/vitest.ts',
      'vitest.react': 'src/vitest.react.ts',
      tsup: 'src/tsup.ts',
      vite: 'src/vite.ts',
      'repo-lint': 'src/repo-lint.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
  },
  {
    entry: { bin: 'src/bin.ts' },
    format: ['esm'],
    clean: false,
  },
])
