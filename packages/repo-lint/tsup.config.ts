import { defineConfig } from 'tsup'
import { defineBinConfig, defineLibConfig } from '@lzear/configs/tsup'

export default defineConfig([
  defineLibConfig({ index: 'src/index.ts' }),
  defineBinConfig({ bin: 'src/bin.ts' }),
])
