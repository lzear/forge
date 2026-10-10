import type { Linter } from 'eslint'
import type { ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

export const json = async (config: ConfigOptions): Promise<Linter.Config[]> => {
  if (!config.json) return []

  const jsonPlugin = await interopDefault(import('@eslint/json'))

  const base = {
    plugins: { json: jsonPlugin },
    rules: jsonPlugin.configs.recommended.rules,
  }

  return [
    {
      ...base,
      name: 'lzear/json',
      files: FILES.JSON,
      // `packageJson()` lints package.json
      ignores: [
        ...FILES.JSONC,
        ...FILES.PACKAGE_JSON,
        ...FILES.MARKDOWN_BLOCKS,
      ],
      language: 'json/json',
    },
    {
      ...base,
      name: 'lzear/jsonc',
      files: FILES.JSONC,
      ignores: FILES.MARKDOWN_BLOCKS,
      language: 'json/jsonc',
      languageOptions: { allowTrailingCommas: true },
    },
    {
      ...base,
      name: 'lzear/json5',
      files: FILES.JSON5,
      ignores: FILES.MARKDOWN_BLOCKS,
      language: 'json/json5',
    },
  ]
}
