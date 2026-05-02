import { type Options } from 'tsup'

export const defineLibConfig = (entry: Record<string, string>): Options => ({
  entry,
  format: ['esm'],
  dts: true,
  clean: true,
})

export const defineBinConfig = (entry: Record<string, string>): Options => ({
  entry,
  format: ['esm'],
  banner: { js: '#!/usr/bin/env node' },
  clean: false,
})
