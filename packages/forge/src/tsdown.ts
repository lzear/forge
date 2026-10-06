/**
Re-export of `@lzear/configs/tsdown`: tsdown config factories.

```ts
// tsdown.config.ts
import { defineLibConfig } from '@lzear/forge/tsdown'

export default defineLibConfig({ index: 'src/index.ts' })
```

@module
*/

export { defineBinConfig, defineLibConfig } from '@lzear/configs/tsdown'
