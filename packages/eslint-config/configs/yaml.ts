import type { Linter } from 'eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

export const yaml = async (config: ConfigOptions): Promise<Linter.Config> => {
  if (!config.yaml) return {}

  const ymlPlugin = await interopDefault(import('eslint-plugin-yml'))

  // the presets' last objects hold their rules, for every file
  const rules = (preset: Linter.Config[]): Linter.Config['rules'] =>
    preset.at(-1)?.rules

  return {
    name: 'lzear/yaml',

    files: FILES.YAML,

    // only JS/TS code blocks are linted
    ignores: FILES.MARKDOWN_BLOCKS,

    plugins: { yml: ymlPlugin },

    language: 'yml/yaml',

    rules: {
      ...rules(ymlPlugin.configs.recommended),
      // Prettier formats YAML
      ...rules(ymlPlugin.configs.prettier),
      // GitHub Actions triggers take none (`workflow_dispatch:`)
      'yml/no-empty-mapping-value': 0,
    },
  }
}
