/**
 * Vite config factory for React apps.
 *
 * ```ts
 * // vite.config.ts
 * import { defineReactConfig } from '@lzear/configs/vite'
 *
 * export default defineReactConfig()
 * ```
 *
 * @module
 */

import react from '@vitejs/plugin-react'
import { isAgent } from 'std-env'
import { type UserConfig } from 'vite'

/**
 * Vite config with the React plugin; warnings and errors only under a coding
 * agent.
 *
 * @param overrides merged shallowly over the defaults
 */
export const defineReactConfig = (overrides: UserConfig = {}): UserConfig => ({
  plugins: [react()],
  logLevel: isAgent ? 'warn' : 'info',
  ...overrides,
})
