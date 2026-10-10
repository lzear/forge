import { mergeConfig } from 'vitest/config'
import base from '@lzear/configs/vitest'

// building the config loads every plugin: slow while `qa` runs lint alongside
export default mergeConfig(base, { test: { testTimeout: 30_000 } })
