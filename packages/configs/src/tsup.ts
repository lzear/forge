/**
 * tsup config factories for ESM libraries and CLI binaries.
 *
 * ```ts
 * // tsup.config.ts
 * import { defineLibConfig } from '@lzear/configs/tsup'
 *
 * export default defineLibConfig({ index: 'src/index.ts' })
 * ```
 *
 * @module
 */

import { isAgent } from 'std-env'
import { type Options } from 'tsup'

/**
 * ESM library build with type declarations; cleans the output folder. Silent
 * under a coding agent, which re-reads tool output every turn.
 *
 * @param entry tsup entry map, output name to source file
 */
export const defineLibConfig = (entry: Record<string, string>): Options => ({
  entry,
  format: ['esm'],
  dts: true,
  clean: true,
  silent: isAgent,
})

/**
 * ESM binary build with a node shebang. Does not clean, so it can share
 * the output folder with {@linkcode defineLibConfig}. Silent under a coding
 * agent.
 *
 * @param entry tsup entry map, output name to source file
 */
export const defineBinConfig = (entry: Record<string, string>): Options => ({
  entry,
  format: ['esm'],
  banner: { js: '#!/usr/bin/env node' },
  clean: false,
  silent: isAgent,
})
