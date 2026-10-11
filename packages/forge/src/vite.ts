/**
Re-export of `@lzear/configs/vite`: the Vite plugin for app and framework
configs (React Router, TanStack Start).

```ts
// vite.config.ts
import { forgePlugin } from '@lzear/forge/vite'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [forgePlugin()] })
```

@module
*/

export { forgePlugin } from '@lzear/configs/vite'
