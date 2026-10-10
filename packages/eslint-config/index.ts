import type { Linter } from 'eslint'
import { a11y } from './configs/a11y'
import { core } from './configs/core'
import { detect } from './configs/detect'
import * as FILES from './configs/files'
import { ignores } from './configs/ignores'
import { json } from './configs/json'
import { markdown } from './configs/markdown'
import { node } from './configs/node'
import { packageJson } from './configs/package-json'
import { prettier, prettierOverrides } from './configs/prettier'
import { react } from './configs/react'
import { typescript } from './configs/typescript'
import { vitest } from './configs/vitest'
import { yaml } from './configs/yaml'

export { a11y } from './configs/a11y'
export { core } from './configs/core'
export * as FILES from './configs/files'
export { ignores } from './configs/ignores'
export { json } from './configs/json'
export { markdown } from './configs/markdown'
export { node } from './configs/node'
export { packageJson } from './configs/package-json'
export { prettier } from './configs/prettier'
export { react, RESTRICTED_SYNTAX } from './configs/react'
export { typescript } from './configs/typescript'
export { vitest } from './configs/vitest'
export { yaml } from './configs/yaml'

export type ConfigOptions = {
  json: boolean
  markdown: boolean
  node: boolean
  react: boolean
  typescript: boolean
  vitest: boolean
  yaml: boolean
  local?: string
}

const configGenerator = async (
  options: Partial<ConfigOptions> = {},
): Promise<Linter.Config[]> => {
  const config: ConfigOptions = {
    json: true,
    markdown: true,
    node: true,
    yaml: true,
    ...detect(),
    ...options,
  }

  const [
    reactConfig,
    nodeConfig,
    typescriptConfig,
    vitestConfig,
    jsonConfig,
    markdownConfig,
    yamlConfig,
  ] = await Promise.all([
    react(config),
    node(config),
    typescript(config),
    vitest(config),
    json(config),
    markdown(config),
    yaml(config),
  ])

  return [
    { name: 'lzear/ignores', ignores },
    {
      name: 'lzear/linter-options',
      linterOptions: {
        reportUnusedDisableDirectives: 2 as const,
        reportUnusedInlineConfigs: 2 as const,
      },
    },
    core(config.local),
    {
      name: 'lzear/config-files',
      files: FILES.CONFIGS,
      // tools import them for their default export, often a `defineConfig()`
      rules: { 'unicorn/no-top-level-side-effects': 0 as const },
    },
    a11y(config),
    reactConfig,
    nodeConfig,
    config.node && config.react
      ? {
          name: 'lzear/node-browser',
          files: FILES.REACT,
          // JSX/TSX is browser code: fetch, navigator… aren't Node's to gate
          rules: { 'n/no-unsupported-features/node-builtins': 0 as const },
        }
      : [],
    typescriptConfig,
    vitestConfig,
    jsonConfig,
    // after the JS/TS layers, to relax them in code blocks
    markdownConfig,
    yamlConfig,
    packageJson(),
    prettier,
    prettierOverrides(config),
  ].flat()
}

export default configGenerator
