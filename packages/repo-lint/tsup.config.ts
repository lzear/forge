import { defineBinConfig, defineLibConfig } from '@lzear/configs/tsup'
import { defineConfig } from 'tsup'

export default defineConfig([
  defineLibConfig({ index: 'src/index.ts' }),
  defineBinConfig({ bin: 'src/bin.ts' }),
])
