/**
Vite plugin for app and framework configs (React Router, TanStack Start).

```ts
// vite.config.ts
import { forgePlugin } from '@lzear/configs/vite'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [forgePlugin()] })
```

@module
*/

import { isAgent } from 'std-env'
import type { Plugin } from 'vite'

/**
Warnings and errors only under a coding agent, unless `logLevel` is set; in
dev, a bare 404 for `/.well-known/*`, which browsers probe (Chrome DevTools)
and would otherwise reach the app's SSR.
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
