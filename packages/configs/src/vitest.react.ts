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
import base from './vitest.ts'

/**
 * The config, ready to default-export from the consumer's config file.
 */
const config: ViteUserConfig = defineConfig({
  ...base,
  test: { ...base.test, environment: 'jsdom' },
})

export default config
