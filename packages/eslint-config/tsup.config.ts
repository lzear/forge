import { defineLibConfig } from '@lzear/configs/tsup'
import { defineConfig } from 'tsup'

export default defineConfig(defineLibConfig({ index: 'index.ts' }))
