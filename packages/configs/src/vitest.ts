/**
 * Vitest config for Node projects: globals and v8 coverage.
 *
 * ```ts
 * // vitest.config.ts
 * export { default } from '@lzear/configs/vitest'
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
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['json', 'lcov', 'text'],
    },
  },
})

export default config
