/**
Vitest config for Node projects: globals and v8 coverage.

```ts
// vitest.config.ts
export { default } from '@lzear/configs/vitest'
```

@module
*/

import { isAgent } from 'std-env'
import { defineConfig, type ViteUserConfig } from 'vitest/config'

/**
The config, ready to default-export from the consumer's config file.
*/
const config: ViteUserConfig = defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      // agents re-read output: a summary; lcov stays for Codacy
      reporter: ['lcov', isAgent ? 'text-summary' : 'text'],
    },
  },
})

export default config
