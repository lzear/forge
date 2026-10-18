import e18e from '@e18e/eslint-plugin'
import type { Linter } from 'eslint'
import packageJsonPlugin from 'eslint-package-json'
import { plugin as lzearPlugin } from '../plugin'
import { workspaceManifests } from './detect'
import * as FILES from './files'

export const packageJson = (): Linter.Config[] => {
  const { files, ignores } = workspaceManifests()
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
    ...(files.length > 0
      ? [
          {
            name: 'lzear/package-json/workspaces',
            files,
            ...(ignores.length > 0 && { ignores }),
            // flags every package.json below the cwd, but Node resolves a
            // workspace's `exports`
            rules: { 'package-json/no-nested-exports': 0 as const },
          },
        ]
      : []),
  ]
}
