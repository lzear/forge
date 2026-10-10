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
      // agents re-read output: a summary; json and lcov stay for Codacy and fallow
      reporter: ['json', 'lcov', isAgent ? 'text-summary' : 'text'],
    },
  },
})

export default config
