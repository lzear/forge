import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    vitest: 'src/vitest.ts',
    'vitest.react': 'src/vitest.react.ts',
    tsup: 'src/tsup.ts',
    vite: 'src/vite.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
})
