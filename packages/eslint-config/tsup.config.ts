import { defineConfig } from 'tsup'
import { defineLibConfig } from '@lzear/configs/tsup'

export default defineConfig(defineLibConfig({ index: 'index.ts' }))
