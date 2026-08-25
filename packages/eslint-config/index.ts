import { type Linter } from 'eslint'
import { a11y } from './configs/a11y'
import { core } from './configs/core'
import { ignores } from './configs/ignores'
import { node } from './configs/node'
import { packageJson } from './configs/package-json'
import { prettier } from './configs/prettier'
import { react } from './configs/react'
import { typescript } from './configs/typescript'
import { vitest } from './configs/vitest'

export { a11y } from './configs/a11y'
export { core } from './configs/core'
export * as FILES from './configs/files'
export { ignores } from './configs/ignores'
export { node } from './configs/node'
export { packageJson } from './configs/package-json'
export { prettier } from './configs/prettier'
export { react } from './configs/react'
export { typescript } from './configs/typescript'
export { vitest } from './configs/vitest'

export interface ConfigOptions {
  node: boolean
  react: boolean
  typescript: boolean
  vitest: boolean
  local?: string
}

const configGenerator = async (
  options: Partial<ConfigOptions> = {},
): Promise<Linter.Config[]> => {
  const config: ConfigOptions = {
    node: true,
    react: true,
    typescript: true,
    vitest: true,
    ...options,
  }

  const [reactConfig, nodeConfig, typescriptConfig, vitestConfig] =
    await Promise.all([
      react(config),
      node(config),
      typescript(config),
      vitest(config),
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
    a11y(config),
    reactConfig,
    nodeConfig,
    typescriptConfig,
    vitestConfig,
    packageJson(),
    prettier,
  ].flat()
}

export default configGenerator
