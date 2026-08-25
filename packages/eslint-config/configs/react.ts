import { type Linter } from 'eslint'
import { type ConfigOptions } from '../index'
import { interopDefault } from '../utils'
import * as FILES from './files'

export const react = async (config: ConfigOptions): Promise<Linter.Config> => {
  if (!config.react) return {}

  const [
    reactCompilerPlugin,
    reactHooksPlugin,
    reactPerformancePlugin,
    reactPlugin,
    reactXPlugin,
    reactDomPlugin,
    reactWebApiPlugin,
  ] = await Promise.all([
    interopDefault(import('eslint-plugin-react-compiler')),
    interopDefault(import('eslint-plugin-react-hooks')),
    interopDefault(import('eslint-plugin-react-perf')),
    interopDefault(import('eslint-plugin-react')),
    interopDefault(import('eslint-plugin-react-x')),
    interopDefault(import('eslint-plugin-react-dom')),
    interopDefault(import('eslint-plugin-react-web-api')),
  ] as const)

  const files = config.typescript ? FILES.REACT : FILES.JSX

  return {
    name: 'lzear/react',

    files,

    plugins: {
      react: reactPlugin,
      'react-compiler': reactCompilerPlugin,
      'react-dom': reactDomPlugin,
      'react-hooks': reactHooksPlugin,
      'react-perf': reactPerformancePlugin,
      'react-web-api': reactWebApiPlugin,
      'react-x': reactXPlugin,
    },

    rules: {
      'react-compiler/react-compiler': 2,

      ...reactHooksPlugin.configs.recommended.rules,

      ...reactPerformancePlugin.configs.recommended.rules,
      'react-perf/jsx-no-new-function-as-prop': 0,
      'react-perf/jsx-no-new-object-as-prop': 0,

      ...reactPlugin.configs.recommended.rules,

      'react/react-in-jsx-scope': 0,
      'react/no-unknown-property': [2, { ignore: ['jsx', 'global'] }],

      ...reactXPlugin.configs[
        config.typescript ? 'recommended-typescript' : 'recommended'
      ].rules,

      ...reactDomPlugin.configs.recommended.rules,

      ...reactWebApiPlugin.configs.recommended.rules,
    },

    settings: {
      react: {
        fragment: 'Fragment',
        pragma: 'React',
        version: '19.0',
      },
      'react-x': {
        importSource: 'react',
        polymorphicPropName: 'as',
        version: '19.0',
      },
    },
  }
}
