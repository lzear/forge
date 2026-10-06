/**
Re-export of `@lzear/configs/tsup`: tsup config factories.

```ts
// tsup.config.ts
import { defineLibConfig } from '@lzear/forge/tsup'

export default defineLibConfig({ index: 'src/index.ts' })
```

@module
*/

export { defineBinConfig, defineLibConfig } from '@lzear/configs/tsup'
