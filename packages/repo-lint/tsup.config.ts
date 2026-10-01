import { defineConfig } from 'tsup'
import { defineBinConfig, defineLibConfig } from '@lzear/configs/tsup'

export default defineConfig([
  defineLibConfig({ index: 'src/index.ts' }),
  // src/bin.ts carries its own shebang; the banner would add a second one
  { ...defineBinConfig({ bin: 'src/bin.ts' }), banner: {} },
])
