import { defineConfig, type ViteUserConfig } from 'vitest/config'

const config: ViteUserConfig = defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
    },
  },
})

export default config
