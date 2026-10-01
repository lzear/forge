/**
 * Vitest config for React projects: jsdom, globals and v8 coverage.
 *
 * ```ts
 * // vitest.config.ts
 * export { default } from '@lzear/configs/vitest/react'
 * ```
 *
 * @module
 */

import { defineConfig, type ViteUserConfig } from 'vitest/config'

/**
 * The config, ready to default-export from the consumer's config file.
 */
const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
    },
  },
})

export default config
