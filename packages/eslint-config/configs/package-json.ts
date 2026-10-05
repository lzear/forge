import { readFileSync } from 'node:fs'
import path from 'node:path'
import e18e from '@e18e/eslint-plugin'
import type { Linter } from 'eslint'
import packageJsonPlugin from 'eslint-package-json'
import { plugin as lzearPlugin } from '../plugin'
import * as FILES from './files'

type Manifest = { workspaces?: string[] | { packages?: string[] } }

// The cwd's workspace manifests, as globs (npm, Yarn and Bun read `workspaces`)
const workspaceManifests = (): string[] => {
  let manifest: Manifest
  try {
    manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest
  } catch {
    return []
  }
  const { workspaces = [] } = manifest
  const globs = Array.isArray(workspaces)
    ? workspaces
    : (workspaces.packages ?? [])
  return globs.map((glob) => path.posix.join(glob, 'package.json'))
}

export const packageJson = (): Linter.Config[] => {
  const workspaces = workspaceManifests()
  return [
    packageJsonPlugin.configs.recommended,
    {
      name: 'lzear/package-json',

      files: FILES.PACKAGE_JSON,

      plugins: {
        e18e,
        lzear: lzearPlugin,
      },

      rules: {
        // `preferred` swaps tools by taste (tsup → tsdown), not by weight
        'e18e/ban-dependencies': [2, { presets: ['microutilities', 'native'] }],
        'lzear/major-version-only': 2,
      },
    },
    ...(workspaces.length > 0
      ? [
          {
            name: 'lzear/package-json/workspaces',
            files: workspaces,
            // flags every package.json below the cwd, but Node resolves a
            // workspace's `exports`
            rules: { 'package-json/no-nested-exports': 0 as const },
          },
        ]
      : []),
  ]
}
