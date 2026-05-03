declare module '@eslint-community/eslint-plugin-eslint-comments' {
  import type { ESLint, Linter } from 'eslint'

  let plugin: ESLint.Plugin
  let configs: { recommended: { rules: Linter.RulesRecord } }
  export = { ...plugin, configs }
}

declare module 'eslint-plugin-jsx-a11y' {
  import type { ESLint, Linter } from 'eslint'

  let plugin: ESLint.Plugin
  let flatConfigs: {
    recommended: { rules: Linter.RulesRecord }
    strict: { rules: Linter.RulesRecord }
  }
  export = { ...plugin, flatConfigs }
}

declare module 'eslint-module-utils/moduleVisitor' {
  import type { Rule } from 'eslint'

  type SourceNode = Rule.Node & { value: string }
  type CheckFn = (source: SourceNode, node: Rule.Node) => void
  interface Options {
    amd?: boolean
    commonjs?: boolean
    esmodule?: boolean
  }

  export default function moduleVisitor(
    fn: CheckFn,
    options?: Options,
  ): Rule.RuleListener
}

declare module 'eslint-module-utils/resolve' {
  import type { Rule } from 'eslint'

  export default function resolve(
    modulePath: string,
    context: Rule.RuleContext,
  ): string | null | false
}

declare module 'eslint-plugin-prefer-arrow' {
  import type { ESLint } from 'eslint'

  let plugin: ESLint.Plugin
  export = plugin
}

declare module 'eslint-plugin-promise' {
  import type { ESLint, Linter } from 'eslint'

  let plugin: ESLint.Plugin
  let configs: { recommended: { rules: Linter.RulesRecord } }
  export = { ...plugin, configs }
}

declare module 'eslint-plugin-react-compiler' {
  import type { ESLint } from 'eslint'

  let plugin: ESLint.Plugin
  export = plugin
}

declare module 'eslint-plugin-react-hooks' {
  import type { ESLint, Linter } from 'eslint'

  let plugin: ESLint.Plugin
  let configs: { recommended: { rules: Linter.RulesRecord } }
  export = { ...plugin, configs }
}

declare module 'eslint-plugin-react-perf' {
  import type { ESLint, Linter } from 'eslint'

  let plugin: ESLint.Plugin
  let configs: { recommended: { rules: Linter.RulesRecord } }
  export = { ...plugin, configs }
}
