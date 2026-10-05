/**
 * Vite config factory for React apps, and the plugin behind it for framework
 * configs (React Router, TanStack Start).
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
import type { Plugin, UserConfig } from 'vite'

/**
 * Warnings and errors only under a coding agent, unless `logLevel` is set; in
 * dev, a bare 404 for `/.well-known/*`, which browsers probe (Chrome DevTools)
 * and would otherwise reach the app's SSR.
 */
export const forgePlugin = (): Plugin => ({
  name: 'forge',
  config: (config) => ({
    logLevel: config.logLevel ?? (isAgent ? 'warn' : 'info'),
  }),
  configureServer: (server) => {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/.well-known/')) res.writeHead(404).end()
      else next()
    })
  },
})

/**
 * Vite config with the React plugin and {@link forgePlugin}.
 *
 * @param overrides merged shallowly over the defaults
 */
export const defineReactConfig = (overrides: UserConfig = {}): UserConfig => ({
  plugins: [react(), forgePlugin()],
  ...overrides,
})
