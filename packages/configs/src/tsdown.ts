/**
tsdown config factories for ESM libraries and CLI binaries.

```ts
// tsdown.config.ts
import { defineLibConfig } from '@lzear/configs/tsdown'

export default defineLibConfig({ index: 'src/index.ts' })
```

@module
*/

import { isAgent } from 'std-env'
import type { UserConfig } from 'tsdown'

const base = {
  format: 'esm',
  // `.js` and `.d.ts`, as the exports maps of `"type": "module"` packages expect
  fixedExtension: false,
  logLevel: isAgent ? 'silent' : 'info',
} satisfies UserConfig

/**
ESM library build with type declarations from oxc, which needs code that
passes `isolatedDeclarations` (JSR demands it too); cleans the output folder.
Silent under a coding agent, which re-reads tool output every turn.

@param entry tsdown entry map, output name to source file
*/
export const defineLibConfig = (entry: Record<string, string>): UserConfig => ({
  ...base,
  entry,
  // the lib tsconfig's declaration maps would emit maps for the JS too
  dts: { generator: 'oxc', sourcemap: false },
})

/**
ESM binary build; Rolldown keeps the source's shebang, which
`unicorn/no-process-exit` reads to spot a CLI. Does not clean, so it can
share the output folder with {@linkcode defineLibConfig}. Silent under a
coding agent.

@param entry tsdown entry map, output name to source file
*/
export const defineBinConfig = (entry: Record<string, string>): UserConfig => ({
  ...base,
  entry,
  clean: false,
})
